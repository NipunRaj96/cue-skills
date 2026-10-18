import { loadCatalog } from "./catalog.js";
import { loadRules } from "./rules.js";
import { select } from "./select.js";
import { renderFull, reminder } from "./render.js";
import { loadState, saveState, resetState } from "./state.js";
import { logEvent } from "./log.js";
import { expandHome } from "./paths.js";

const EMPTY = () => ({ text: "", skills: [] });

export function run({ agent, session = "default", phase, reset = false, prompt = "", files = [], cwd }) {
  if (process.env.CUE_DISABLE === "1") return EMPTY();
  try {
    const rules = loadRules(cwd);
    const catalog = loadCatalog({ cwd, extraDirs: rules.skillDirs.map(expandHome) });
    const { selected, unresolved } = select({ prompt, files, cwd, rules, catalog });
    const entries = selected.map((s) => s.entry);
    const id = (e) => (e.plugin ? `${e.plugin}:${e.name}` : e.name);

    let text;
    if (phase === "system") text = renderFull(entries);
    else {
      if (reset) resetState(agent, session);
      const seen = loadState(agent, session);
      const fresh = entries.filter((e) => !seen.has(id(e)));
      const bodies = renderFull(fresh);
      if (fresh.length) { fresh.forEach((e) => seen.add(id(e))); saveState(agent, session, seen); }
      const rem = phase === "tool" ? "" : reminder(entries);
      text = bodies && rem ? `${bodies}\n${rem}` : bodies || rem;
    }
    const skills = selected.map((s) => ({ name: s.entry.name, reason: s.reason }));
    logEvent({ agent, session, event: phase, skills, chars: text.length, unresolved, errors: rules.errors });
    return { text, skills };
  } catch (e) {
    logEvent({ agent, session, event: phase, error: e.message });
    return EMPTY();
  }
}
