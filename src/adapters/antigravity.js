// Verified on this machine (agy 1.4.2, 2026-10-19):
// - Docs: ~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/hooks.md
// - hooks.json is NOT Claude's layout. Top level = named hooks: {"<name>": {"<Event>": [...]}}.
//   SessionStart/PreInvocation/PostInvocation/Stop = FLAT handler list [{type,command,timeout(s)}];
//   PreToolUse/PostToolUse = matcher groups [{matcher,hooks:[...]}]. Optional "enabled": false per name.
// - Live probe: agy -p reads ~/.gemini/config/hooks.json (global root); handlers got camelCase stdin
//   (conversationId, workspacePaths, modelName, transcriptPath; PreInvocation adds invocationNum).
//   Probe file removed afterwards. settings.json untouched (it has no hooks key).
// - So the CLI and the App/IDE read the same file; both adapters write the same "cue-skills" entry.
// - Output: {"injectSteps":[{"ephemeralMessage":text}]} (transient, dropped after the turn).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../jsonfile.js";
import { home } from "../paths.js";
import { run } from "../engine.js";

const MARK = "cue-skills hook";
const NAME = "cue-skills";
const SPEC = [["SessionStart", 5], ["PreInvocation", 5]];
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isOurs = (h) => plain(h) && typeof h.command === "string" && h.command.includes(MARK);
const file = () => join(home(), ".gemini/config/hooks.json");

function load() {
  const f = file();
  let d;
  try { d = readJson(f, {}); } catch { throw new Error(`${f}: invalid JSON, not modified`); }
  const okHook = (v) => plain(v) && Object.entries(v).every(([k, x]) => k === "enabled" || Array.isArray(x));
  if (!plain(d) || !Object.values(d).every(okHook)) throw new Error(`${f}: unexpected hooks shape, not modified`);
  return d;
}

function install(cmd) {
  const d = load();
  const mine = (d[NAME] ||= {});
  if (!Object.values(d).some((v) => Object.values(v).some((l) => Array.isArray(l) && l.some(isOurs)))) {
    for (const [ev, timeout] of SPEC) (mine[ev] ||= []).push({ type: "command", command: `${cmd} ${ev}`, timeout });
  }
  writeJson(file(), d);
  return `hooks installed in ${file()}.`;
}

function uninstall() {
  if (!existsSync(file())) return;
  const d = load();
  let changed = false;
  for (const [name, hook] of Object.entries(d)) {
    for (const [ev, list] of Object.entries(hook)) {
      if (!Array.isArray(list) || !list.some(isOurs)) continue;
      changed = true;
      const kept = list.filter((h) => !isOurs(h));
      if (kept.length) hook[ev] = kept; else delete hook[ev];
    }
    if (changed && !Object.keys(hook).length) delete d[name];
  }
  if (changed) writeJson(file(), d);
}

function isInstalled() {
  try { return existsSync(file()) && Object.values(load()).some((v) => Object.values(v).some((l) => Array.isArray(l) && l.some(isOurs))); } catch { return false; }
}

const PHASE = { SessionStart: { phase: "start" }, PreInvocation: { phase: "prompt", prompt: "" } };

function make(id, label, status, detect) {
  return {
    id, label, status, detect, isInstalled,
    install: (cmd) => `${label}: ${install(cmd)}`,
    uninstall: () => { uninstall(); return `${label}: hooks removed from ${file()}.`; },
    handle(event, input) {
      const m = PHASE[event];
      if (!m) return "";
      const { text } = run({ agent: id, session: input.conversationId, cwd: input.workspacePaths?.[0] ?? process.cwd(), ...m });
      return text ? JSON.stringify({ injectSteps: [{ ephemeralMessage: text }] }) : "";
    },
  };
}

export const antigravityCli = make("antigravity-cli", "Antigravity CLI", "tested", () => {
  try { execFileSync("which", ["agy"], { stdio: "ignore" }); return true; } catch { return false; }
});
export const antigravityApp = make("antigravity-app", "Antigravity App/IDE", "experimental", () =>
  ["/Applications/Antigravity.app", "/Applications/Antigravity IDE.app"].some(existsSync));
