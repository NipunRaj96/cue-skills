import { loadCatalog } from "./catalog.js";
import { loadRules } from "./rules.js";
import { select } from "./select.js";
import { renderFull, reminder, REMINDER_RESERVE } from "./render.js";
import { loadState, saveState, resetState } from "./state.js";
import { logEvent } from "./log.js";

const EMPTY = () => ({ text: "", skills: [] });

export function run({ agent, session = "default", phase, reset = false, prompt = "", files = [], cwd }) {
  cwd ??= process.cwd();
  if (process.env.CUE_DISABLE === "1") return EMPTY();
  try {
    const rules = loadRules(cwd);
    const catalog = loadCatalog({ cwd, rules });
    const { selected, unresolved, errors } = select({ prompt, files, cwd, rules, catalog });
    const entries = selected.map((s) => s.entry);
    const id = (e) => (e.plugin ? `${e.plugin}:${e.name}` : e.name);

    let text;
    if (phase === "system") text = renderFull(entries);
    else if (phase === "remind") text = reminder(entries); // stateless: reminder line only
    else {
      if (reset) resetState(agent, session);
      const seen = loadState(agent, session);
      const fresh = entries.filter((e) => !seen.has(id(e)));
      const rem = phase === "tool" ? "" : reminder(entries);
      const bodies = renderFull(fresh, rem ? 9000 - REMINDER_RESERVE : 9000);
      if (fresh.length) { fresh.forEach((e) => seen.add(id(e))); saveState(agent, session, seen); }
      text = bodies && rem ? `${bodies}\n${rem}` : bodies || rem;
    }
    const skills = selected.map((s) => ({ name: s.entry.name, reason: s.reason }));
    logEvent({ agent, session, event: phase, skills, chars: text.length, unresolved, errors: [...rules.errors, ...errors] });
    return { text, skills };
  } catch (e) {
    logEvent({ agent, session, event: phase, error: e.message });
    return EMPTY();
  }
}
