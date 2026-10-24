import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../jsonfile.js";
import { home } from "../paths.js";
import { run } from "../engine.js";

// Cue's own hook command only: bare, or the bin path quoted ('..cue-skills.js' hook / "..." hook).
export const MARK = /(^|[\/'"\s])cue-skills(\.js)?['"]? hook(\s|$)/;

const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function load(file) {
  let data;
  try { data = readJson(file, {}); } catch { throw new Error(`${file}: invalid JSON, not modified`); }
  if (!plain(data) || ("hooks" in data && (!plain(data.hooks) || !Object.values(data.hooks).every(Array.isArray))))
    throw new Error(`${file}: unexpected hooks shape, not modified`);
  return data;
}
const isOurs = (h) => plain(h) && typeof h.command === "string" && MARK.test(h.command);
const handlers = (g) => (plain(g) && Array.isArray(g.hooks) ? g.hooks : []);

export function addHooks(file, spec, cmd) {
  const data = load(file);
  data.hooks ||= {};
  for (const { event, matcher, timeout } of spec) {
    const groups = (data.hooks[event] ||= []);
    const mine = groups.find((g) => handlers(g).some(isOurs));
    if (mine) {
      if (mine.matcher === matcher) continue;
      // a matcher changed between versions: update our own group in place; if a foreign hook shares it, move ours out instead
      if (handlers(mine).every(isOurs)) { if (matcher) mine.matcher = matcher; else delete mine.matcher; continue; }
      mine.hooks = mine.hooks.filter((h) => !isOurs(h));
    }
    const group = { hooks: [{ type: "command", command: `${cmd} ${event}`, timeout }] };
    if (matcher) group.matcher = matcher;
    groups.push(group);
  }
  writeJson(file, data);
}

export function removeHooks(file) {
  if (!existsSync(file)) return;
  const data = load(file);
  let changed = false;
  for (const [event, groups] of Object.entries(data.hooks || {})) {
    const kept = [];
    for (const g of groups) {
      if (!plain(g) || !Array.isArray(g.hooks)) { kept.push(g); continue; }
      const hs = g.hooks.filter((h) => !isOurs(h));
      if (hs.length === g.hooks.length) { kept.push(g); continue; }
      changed = true;
      if (hs.length) kept.push({ ...g, hooks: hs });
    }
    if (kept.length) data.hooks[event] = kept; else if (groups.length) { delete data.hooks[event]; }
  }
  if (changed) writeJson(file, data);
}

export function hasHooks(file) {
  try {
    return existsSync(file) && Object.values(load(file).hooks || {}).flat().flatMap(handlers).some(isOurs);
  } catch { return false; }
}

// Shared adapter factory. map: event -> (input) => engine args. suffix: extra install summary text.
export function jsonAdapter({ id, label, status, dir, fileName, spec, map, detect = () => existsSync(join(home(), dir)), suffix = "" }) {
  const file = () => join(home(), dir, fileName);
  return {
    id, label, status, detect,
    isInstalled: () => hasHooks(file()),
    install(cmd) { addHooks(file(), spec, cmd); return `${label}: hooks installed in ${file()}.${suffix}`; },
    uninstall() { removeHooks(file()); return `${label}: hooks removed from ${file()}.`; },
    handle(event, input) {
      const m = map[event];
      if (!m) return "";
      const args = m(input);
      if (!args) return ""; // the event carried nothing to act on
      const { text, notice } = run({ agent: id, session: input.session_id, cwd: input.cwd, ...args });
      if (!text) return "";
      const out = { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
      if (notice) out.systemMessage = notice;
      return JSON.stringify(out);
    },
  };
}
