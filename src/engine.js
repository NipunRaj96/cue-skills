import { relative } from "node:path";
import { loadAll, entryId as id } from "./catalog.js";
import { projectRoot } from "./paths.js";
import { queryParts, projectSummary } from "./signals.js";
import { THRESHOLDS, pickStep, planInjection, renderPlan } from "./pick.js";
import { loadRules } from "./rules.js";
import { select } from "./select.js";
import { renderFull, reminder, REMINDER_RESERVE } from "./render.js";
import { loadSession, saveSession, resetState } from "./state.js";
import { CHECKERS } from "./enforce.js";
import { logEvent } from "./log.js";

export const CAP_TOKENS = 2000; // per-turn cap for enforcer bodies, token = ceil(chars / 4)
export const REINJECT_EVERY = 10;
const CAP_CHARS = CAP_TOKENS * 4;

const toks = (s) => Math.ceil(s.length / 4);
const EMPTY = () => ({ text: "", skills: [] });

// Enforcer (auto agents): count the prompt, then re-inject the full body of standing skills that
// drifted (correction first) or have no checker (every REINJECT_EVERY prompts). Bodies are admitted
// drifted first, then standing order; one that would pass the cap degrades to a Read card inside renderFull.
function enforce(selected, st, used) {
  const turn = ++st.turns;
  const out = { text: "", notes: [], entries: [], corrected: [] };
  const standing = selected.filter((x) => x.reason === "always").map((x) => x.entry);
  // a flag for a skill that is not selected (uninstalled, unresolved, vetoed) can never be acted on
  for (const k of Object.keys(st.drift)) if (!standing.some((e) => e.name === k)) delete st.drift[k];
  const todo = standing
    .map((e) => ({ e, drift: Object.hasOwn(st.drift, e.name) ? st.drift[e.name] : undefined }))
    .filter((x) => x.drift || (!Object.hasOwn(CHECKERS, x.e.name) && turn % REINJECT_EVERY === 0))
    .sort((a, b) => !!b.drift - !!a.drift); // a drifted skill is the active failure: full body first
  for (const { e, drift } of todo) {
    const head = drift ? `Previous reply did not follow ${e.name}: ${drift.slice(0, 200)}. Follow it from now on.\n` : "";
    const body = renderFull([e], CAP_CHARS - used - out.text.length - head.length);
    if (!body) continue; // no room: keep the flag for the next prompt
    out.text += head + body;
    out.entries.push(e);
    if (drift) { delete st.drift[e.name]; out.corrected.push({ name: e.name, reason: drift }); }
    out.notes.push(`${e.name} re-applied (${drift ? "drift" : `every ${REINJECT_EVERY} turns`})`);
  }
  return out;
}


// Picker (auto agents): one query from this hook's signals -> shortlist (or a lone winner's body) from what is left of the turn cap.
// Skipped: standing and already injected skills, everything shortlisted this session, and rules.never.
function pick({ cards, index, selected, st, rules, cwd, prompt, tool, files, failure, phase, thresholds }) {
  const root = projectRoot(cwd), f = files[0] ?? "";
  const rel = f && !relative(root, f).startsWith("..") ? relative(root, f) : f;
  const first = phase === "prompt" && !st.projectSent;
  const { parts, label } = queryParts({ prompt: phase === "prompt" ? prompt : "", tool, file: rel, failure, project: first ? projectSummary(root) : "" });
  if (phase === "prompt") st.projectSent = true;
  const exclude = new Set([...selected.map((x) => x.entry.name), ...st.picks, ...[...st.seen].map((x) => x.split(":").pop())]);
  for (const c of cards) if (rules.never.includes(c.name) || rules.never.includes(id(c))) exclude.add(c.name);
  const d = pickStep({ cards, index, parts, exclude, thresholds });
  const plan = planInjection(d, { cap: CAP_TOKENS - st.turnTokens });
  if (!plan.items.length) return null;
  const text = renderPlan(plan);
  if (!text) return null;
  const names = plan.items.map((x) => x.card.name);
  st.picks.push(...names);
  st.turnTokens += toks(text);
  const note = d.kind === "confident" ? `${names[0]} (${label})` : `shortlist: ${names.join(", ")} (${label})`;
  return { text, note, label, kind: d.kind, names, tokens: toks(text) };
}

export function run({ agent, session = "default", phase, reset = false, prompt = "", files = [], cwd, auto = false, tool = "", failure = false, thresholds = THRESHOLDS }) {
  cwd ??= process.cwd();
  if (process.env.CUE_DISABLE === "1") return EMPTY();
  try {
    const rules = loadRules(cwd);
    const { entries: catalog, cards, index } = loadAll({ cwd, rules });
    const { selected, unresolved, errors } = select({ prompt, files, cwd, rules, catalog });
    const entries = selected.map((s) => s.entry);

    let text, notice;
    if (phase === "system") text = renderFull(entries);
    else if (phase === "remind") text = reminder(entries); // stateless: reminder line only
    else {
      if (reset) resetState(agent, session);
      const st = loadSession(agent, session);
      const rem = phase === "tool" ? "" : reminder(entries);
      const enf = auto && phase === "prompt" ? enforce(selected, st, rem.length + 2) : { text: "", notes: [], entries: [], corrected: [] };
      if (auto && phase === "prompt") st.turnTokens = toks(enf.text); // a new turn: the enforcer takes its share first
      const fresh = entries.filter((e) => !st.seen.has(id(e)) && !enf.entries.includes(e));
      const budget = enf.text ? Math.max(0, CAP_CHARS - enf.text.length - rem.length - 2) : rem ? 9000 - REMINDER_RESERVE : 9000;
      const bodies = renderFull(fresh, budget);
      // auto agents: a body that did not fit stays unseen and is retried next prompt
      const shown = auto ? fresh.filter((e) => bodies.includes(`## Skill: ${e.name}\n`)) : fresh;
      shown.concat(enf.entries).forEach((e) => st.seen.add(id(e)));
      const pk = auto && rules.picker && (phase === "prompt" || phase === "tool")
        ? pick({ cards, index, selected, st, rules, cwd, prompt, tool, files, failure, phase, thresholds }) : null;
      if (shown.length || enf.entries.length || pk || (auto && phase === "prompt")) saveSession(agent, session, st);
      text = [enf.text, bodies, rem, pk?.text].filter(Boolean).join("\n");
      const notes = [...enf.notes, ...(pk ? [pk.note] : [])];
      if (notes.length) notice = `cue → ${notes.join("; ")}`;
      if (pk) logEvent({ agent, session, event: "pick", label: pk.label, mode: pk.kind, picks: pk.names, skills: pk.names, tokens: pk.tokens });
      if (enf.corrected.length) logEvent({ agent, session, event: "drift-corrected", skills: enf.corrected });
    }
    const skills = selected.map((s) => ({ name: s.entry.name, reason: s.reason }));
    logEvent({ agent, session, event: phase, skills, chars: text.length, unresolved, errors: [...rules.errors, ...errors] });
    return notice ? { text, skills, notice } : { text, skills };
  } catch (e) {
    logEvent({ agent, session, event: phase, error: e.message });
    return EMPTY();
  }
}
