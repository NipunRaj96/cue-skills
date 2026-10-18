import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../jsonfile.js";
import { home } from "../paths.js";
import { run } from "../engine.js";

// matches `cue-skills hook` and `.../cue-skills.js' hook` (quoted bin path)
const MARK = /cue-skills\S* hook/;
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isOurs = (h) => plain(h) && typeof h.command === "string" && MARK.test(h.command);
const file = () => join(home(), ".cursor/hooks.json");

function load() {
  const f = file();
  let d;
  try { d = readJson(f, {}); } catch { throw new Error(`${f}: invalid JSON, not modified`); }
  if (!plain(d) || ("hooks" in d && (!plain(d.hooks) || !Object.values(d.hooks).every(Array.isArray))))
    throw new Error(`${f}: unexpected hooks shape, not modified`);
  return d;
}

export default {
  id: "cursor", label: "Cursor", status: "experimental",
  detect: () => existsSync(join(home(), ".cursor")),
  isInstalled() {
    try { return existsSync(file()) && Object.values(load().hooks || {}).flat().some(isOurs); } catch { return false; }
  },
  install(cmd) {
    const d = load();
    d.version ??= 1;
    d.hooks ||= {};
    const l = (d.hooks.sessionStart ||= []);
    if (!l.some(isOurs)) l.push({ command: `${cmd} sessionStart` });
    writeJson(file(), d);
    return `Cursor: hooks installed in ${file()}.`;
  },
  uninstall() {
    if (existsSync(file())) {
      const d = load();
      let changed = false;
      for (const [ev, l] of Object.entries(d.hooks || {})) {
        if (!l.some(isOurs)) continue;
        changed = true;
        const kept = l.filter((h) => !isOurs(h));
        if (kept.length) d.hooks[ev] = kept; else delete d.hooks[ev];
      }
      if (changed) writeJson(file(), d);
    }
    return `Cursor: hooks removed from ${file()}.`;
  },
  handle(event, input) {
    if (event !== "sessionStart") return "";
    const { text } = run({ agent: "cursor", session: input.session_id, cwd: input.workspace_roots?.[0] ?? process.cwd(), phase: "start" });
    return text ? JSON.stringify({ additional_context: text }) : "";
  },
};
