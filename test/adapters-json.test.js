import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../src/jsonfile.js";
import { runHook } from "../src/hook.js";
import { get, adapters } from "../src/adapters/index.js";

const CMD = (id) => `node /x/cue-skills hook ${id}`;
function fixture() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "cue-")));
  process.env.HOME = h;
  delete process.env.CUE_DISABLE;
  const cwd = join(h, "proj");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  mkdirSync(join(h, ".claude/skills/caveman"), { recursive: true });
  writeFileSync(join(h, ".claude/skills/caveman/SKILL.md"), "---\nname: caveman\ndescription: terse\n---\nbody\n");
  mkdirSync(join(h, ".cue"), { recursive: true });
  writeFileSync(join(h, ".cue/rules.yaml"), "always: [caveman]\n");
  return { h, cwd };
}
const ours = (s, ev) => (s.hooks[ev] || []).flatMap((g) => g.hooks).filter((x) => x.command.includes("cue-skills hook"));

test("install preserves foreign hooks, idempotent, uninstall clean", () => {
  const { h } = fixture();
  const claude = get("claude");
  const settings = join(h, ".claude/settings.json");
  writeJson(settings, { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo caveman" }] }] }, theme: "dark" });
  claude.install(CMD("claude")); claude.install(CMD("claude"));
  assert.ok(claude.isInstalled());
  const s = readJson(settings);
  assert.equal(s.theme, "dark");
  assert.equal(ours(s, "SessionStart").length, 1);
  assert.equal(ours(s, "SubagentStart").length, 1);
  assert.equal(s.hooks.SubagentStart[0].matcher, undefined);
  assert.equal(ours(s, "PreToolUse")[0].command, CMD("claude") + " PreToolUse");
  assert.ok(s.hooks.SessionStart.flatMap((g) => g.hooks).some((x) => x.command === "echo caveman"));
  claude.uninstall();
  const t = JSON.stringify(readJson(settings));
  assert.ok(!t.includes("cue-skills hook") && t.includes("echo caveman"));
  assert.equal(readJson(settings).hooks.PreToolUse, undefined);
  assert.ok(!claude.isInstalled());
});

test("invalid settings json is not overwritten", () => {
  const { h } = fixture();
  const f = join(h, ".claude/settings.json");
  writeFileSync(f, "{oops");
  assert.throws(() => get("claude").install(CMD("claude")), /invalid JSON, not modified/);
  assert.equal(readJson(join(h, ".claude/settings.json.bak"), "x"), "x");
});

test("codex and gemini install", () => {
  const { h } = fixture();
  assert.match(get("codex").install(CMD("codex")), /Run \/hooks in Codex to trust them\./);
  assert.equal(readJson(join(h, ".codex/hooks.json")).hooks.PreToolUse, undefined);
  get("gemini").install(CMD("gemini"));
  const g = readJson(join(h, ".gemini/settings.json"));
  assert.equal(ours(g, "BeforeAgent")[0].timeout, 5000);
  assert.ok(get("gemini").detect());
  assert.deepEqual(adapters.map((a) => a.id).slice(0, 3), ["claude", "codex", "gemini"]);
});

test("claude output shape", () => {
  const { cwd } = fixture();
  const out = JSON.parse(runHook("claude", "UserPromptSubmit", JSON.stringify({ session_id: "x", cwd, prompt: "hi" })));
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(out.hookSpecificOutput.additionalContext, /Active skills:/);
  const sub = JSON.parse(runHook("claude", "SubagentStart", JSON.stringify({ session_id: "y", cwd })));
  assert.equal(sub.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(sub.hookSpecificOutput.additionalContext, /## Skill: caveman/);
  const g = JSON.parse(runHook("gemini", "BeforeAgent", JSON.stringify({ session_id: "g", cwd, prompt: "hi" })));
  assert.equal(g.hookSpecificOutput.hookEventName, "BeforeAgent");
});

test("unmapped event, bad stdin, unknown adapter → empty", () => {
  const { cwd } = fixture();
  assert.equal(runHook("claude", "Nope", JSON.stringify({ cwd })), "");
  assert.equal(runHook("nope", "SessionStart", "{}"), "");
  assert.equal(runHook("claude", "UserPromptSubmit", ""), "");
  assert.equal(runHook("claude", "UserPromptSubmit", "{oops"), "");
});

test("malformed rules → no throw, empty or valid JSON", () => {
  const { h, cwd } = fixture();
  writeFileSync(join(h, ".cue/rules.yaml"), "always: [unclosed\n  : : {");
  let out;
  assert.doesNotThrow(() => { out = runHook("claude", "UserPromptSubmit", JSON.stringify({ session_id: "m", cwd, prompt: "hi" })); });
  assert.ok(out === "" || JSON.parse(out));
});
