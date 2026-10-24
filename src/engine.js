import { loadCatalog, entryId as id } from "./catalog.js";
import { loadRules } from "./rules.js";
import { select } from "./select.js";
import { renderFull, reminder, REMINDER_RESERVE } from "./render.js";
import { loadSession, saveSession, resetState } from "./state.js";
import { CHECKERS } from "./enforce.js";
import { logEvent } from "./log.js";

export const CAP_TOKENS = 2000; // per-turn cap for enforcer bodies, token = ceil(chars / 4)
export const REINJECT_EVERY = 10;
const CAP_CHARS = CAP_TOKENS * 4;

const EMPTY = () => ({ text: "", skills: [] });

// Enforcer (auto agents): count the prompt, then re-inject the full body of standing skills that
// drifted (correction first) or have no checker (every REINJECT_EVERY prompts). Bodies are admitted
// in standing order; one that would pass the cap degrades to a Read card inside renderFull.
function enforce(selected, st, used) {
  const turn = ++st.turns;
  const out = { text: "", notes: [], entries: [], corrected: [] };
  for (const { entry: e, reason } of selected) {
    if (reason !== "always") continue;
    const drift = st.drift[e.name];
    const periodic = !Object.hasOwn(CHECKERS, e.name) && turn % REINJECT_EVERY === 0;
    if (!drift && !periodic) continue;
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

export function run({ agent, session = "default", phase, reset = false, prompt = "", files = [], cwd, auto = false }) {
  cwd ??= process.cwd();
  if (process.env.CUE_DISABLE === "1") return EMPTY();
  try {
    const rules = loadRules(cwd);
    const catalog = loadCatalog({ cwd, rules });
    const { selected, unresolved, errors } = select({ prompt, files, cwd, rules, catalog });
    const entries = selected.map((s) => s.entry);

    let text, notice;
    if (phase === "system") text = renderFull(entries);
    else if (phase === "remind") text = reminder(entries); // stateless: reminder line only
    else {
      if (reset) resetState(agent, session);
      const st = loadSession(agent, session);
      const rem = phase === "tool" ? "" : reminder(entries);
      const enf = auto && phase === "prompt" ? enforce(selected, st, rem.length) : { text: "", notes: [], entries: [], corrected: [] };
      const fresh = entries.filter((e) => !st.seen.has(id(e)) && !enf.entries.includes(e));
      const budget = enf.text ? Math.max(0, CAP_CHARS - enf.text.length - rem.length) : rem ? 9000 - REMINDER_RESERVE : 9000;
      const bodies = renderFull(fresh, budget);
      // auto agents: a body that did not fit stays unseen and is retried next prompt
      const shown = auto ? fresh.filter((e) => bodies.includes(`## Skill: ${e.name}\n`)) : fresh;
      shown.concat(enf.entries).forEach((e) => st.seen.add(id(e)));
      if (shown.length || enf.entries.length || (auto && phase === "prompt")) saveSession(agent, session, st);
      text = [enf.text, bodies, rem].filter(Boolean).join("\n");
      if (enf.notes.length) notice = `cue → ${enf.notes.join("; ")}`;
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
