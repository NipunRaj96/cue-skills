import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../jsonfile.js";
import { home } from "../paths.js";
import { run } from "../engine.js";

const MARK = "cue-skills hook";

function load(file) {
  try { return readJson(file, {}); } catch { throw new Error(`${file}: invalid JSON, not modified`); }
}
const cmds = (data) => Object.values(data.hooks || {}).flatMap((gs) => gs.flatMap((g) => g.hooks || []));
const isOurs = (h) => typeof h.command === "string" && h.command.includes(MARK);

export function addHooks(file, spec, cmd) {
  const data = load(file);
  data.hooks ||= {};
  for (const { event, matcher, timeout } of spec) {
    const groups = (data.hooks[event] ||= []);
    if (groups.flatMap((g) => g.hooks || []).some(isOurs)) continue;
    const group = { hooks: [{ type: "command", command: `${cmd} ${event}`, timeout }] };
    if (matcher) group.matcher = matcher;
    groups.push(group);
  }
  writeJson(file, data);
}

export function removeHooks(file) {
  if (!existsSync(file)) return;
  const data = load(file);
  for (const [event, groups] of Object.entries(data.hooks || {})) {
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length);
    if (kept.length) data.hooks[event] = kept; else delete data.hooks[event];
  }
  writeJson(file, data);
}

export const hasHooks = (file) => existsSync(file) && cmds(load(file)).some(isOurs);

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
      const { text } = run({ agent: id, session: input.session_id, cwd: input.cwd, ...m(input) });
      return text ? JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }) : "";
    },
  };
}
