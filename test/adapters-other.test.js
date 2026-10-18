import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../src/jsonfile.js";
import { runHook } from "../src/hook.js";
import { get, adapters } from "../src/adapters/index.js";
import { syncAgentsMd } from "../src/sync.js";

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
const AG = (h) => join(h, ".gemini/config/hooks.json");

test("registered in index", () => {
  assert.deepEqual(adapters.map((a) => a.id).slice(3, 5), ["antigravity", "cursor"]);
});

test("antigravity install: named hook, flat events, foreign kept, idempotent, uninstall", () => {
  const { h } = fixture();
  const foreign = { other: { PreToolUse: [{ matcher: "*", hooks: [{ command: "keep" }] }] } };
  writeJson(AG(h), foreign);
  get("antigravity").install(CMD("antigravity")); get("antigravity").install(CMD("antigravity"));
  const f = readJson(AG(h));
  assert.deepEqual(f.other, foreign.other);
  assert.deepEqual(f["cue-skills"].SessionStart, [{ type: "command", command: CMD("antigravity") + " SessionStart", timeout: 5 }]);
  assert.equal(f["cue-skills"].PreInvocation.length, 1);
  assert.ok(get("antigravity").isInstalled());
  get("antigravity").uninstall();
  assert.deepEqual(readJson(AG(h)), foreign);
});

test("antigravity odd shape / bad json not modified", () => {
  const { h } = fixture();
  mkdirSync(join(h, ".gemini/config"), { recursive: true });
  for (const raw of ['[]', '{"x":"y"}', '{"x":{"SessionStart":{}}}']) {
    writeFileSync(AG(h), raw);
    assert.throws(() => get("antigravity").install(CMD("a")), /unexpected hooks shape, not modified/);
    assert.equal(readFileSync(AG(h), "utf8"), raw);
  }
  writeFileSync(AG(h), "{oops");
  assert.throws(() => get("antigravity").install(CMD("a")), /invalid JSON, not modified/);
});

test("antigravity detect via agy on PATH", () => {
  fixture();
  const bin = mkdtempSync(join(tmpdir(), "bin-"));
  writeFileSync(join(bin, "agy"), "#!/bin/sh\n", { mode: 0o755 });
  const old = process.env.PATH;
  process.env.PATH = `${bin}:${old}`;
  try { assert.equal(get("antigravity").detect(), true); } finally { process.env.PATH = old; }
});

test("uninstall keeps empty foreign entries", () => {
  const { h } = fixture();
  writeJson(AG(h), { other: {}, keep: { enabled: false } });
  get("antigravity").install(CMD("antigravity"));
  get("antigravity").uninstall();
  assert.deepEqual(readJson(AG(h)), { other: {}, keep: { enabled: false } });
});

test("install repairs partial, no empty cue-skills when already installed", () => {
  const { h } = fixture();
  const cmd = CMD("antigravity") + " SessionStart";
  writeJson(AG(h), { "cue-skills": { SessionStart: [{ type: "command", command: cmd, timeout: 5 }] } });
  get("antigravity").install(CMD("antigravity"));
  const f = readJson(AG(h))["cue-skills"];
  assert.equal(f.SessionStart.length, 1);
  assert.equal(f.PreInvocation.length, 1);
  // already ours under a foreign name: no cue-skills key created
  writeJson(AG(h), { mine: { SessionStart: [{ command: cmd }], PreInvocation: [{ command: CMD("antigravity") + " PreInvocation" }] } });
  get("antigravity").install(CMD("antigravity"));
  assert.equal(readJson(AG(h))["cue-skills"], undefined);
});

test("antigravity output shape", () => {
  const { cwd } = fixture();
  const out = JSON.parse(get("antigravity").handle("SessionStart", { conversationId: "c1", workspacePaths: [cwd] }));
  assert.match(out.injectSteps[0].ephemeralMessage, /## Skill: caveman/);
  // PreInvocation: bodies already sent -> reminder only
  const pre = JSON.parse(runHook("antigravity", "PreInvocation", JSON.stringify({ conversationId: "c1", workspacePaths: [cwd] })));
  assert.match(pre.injectSteps[0].ephemeralMessage, /^Active skills: caveman \(terse\)\.$/);
  assert.equal(get("antigravity").id, "antigravity");
  assert.equal(runHook("antigravity", "Stop", JSON.stringify({ conversationId: "c1" })), "");
});

test("cursor install keeps foreign + output shape", () => {
  const { h, cwd } = fixture();
  const f = join(h, ".cursor/hooks.json");
  writeJson(f, { version: 1, hooks: { stop: [{ command: "keep" }] }, extra: 1 });
  const c = get("cursor");
  c.install(CMD("cursor")); c.install(CMD("cursor"));
  const d = readJson(f);
  assert.equal(d.extra, 1);
  assert.deepEqual(d.hooks.stop, [{ command: "keep" }]);
  assert.deepEqual(d.hooks.sessionStart, [{ command: CMD("cursor") + " sessionStart" }]);
  assert.ok(c.isInstalled() && c.detect());
  const out = JSON.parse(runHook("cursor", "sessionStart", JSON.stringify({ session_id: "s", workspace_roots: [cwd] })));
  assert.match(out.additional_context, /## Skill: caveman/);
  c.uninstall();
  assert.deepEqual(readJson(f), { version: 1, hooks: { stop: [{ command: "keep" }] }, extra: 1 });
  writeFileSync(f, '{"hooks":[]}');
  assert.throws(() => c.install(CMD("cursor")), /unexpected hooks shape, not modified/);
});

test("sync replaces block, keeps user text", () => {
  const { cwd } = fixture();
  writeFileSync(join(cwd, "AGENTS.md"), "# Mine\n");
  syncAgentsMd(cwd); const s = syncAgentsMd(cwd);
  const t = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.ok(t.startsWith("# Mine"));
  assert.equal(t.split("<!-- cue-skills:start -->").length, 2);
  assert.equal(t.split("<!-- cue-skills:end -->").length, 2);
  assert.match(t, /## Skill: caveman/);
  assert.equal(typeof s, "string");
  assert.ok(!existsSync(join(cwd, ".cursor/rules/cue-skills.mdc")));
});

test("sync creates file + cursor rule", () => {
  const { cwd } = fixture();
  mkdirSync(join(cwd, ".cursor"));
  syncAgentsMd(join(cwd, ".git/.."));
  assert.ok(existsSync(join(cwd, "AGENTS.md")));
  const m = readFileSync(join(cwd, ".cursor/rules/cue-skills.mdc"), "utf8");
  assert.ok(m.startsWith("---\ndescription: cue-skills active skills\nalwaysApply: true\n---\n"));
  assert.match(m, /## Skill: caveman/);
});

test("sync unmatched START replaced to EOF, .bak once", () => {
  const { cwd } = fixture();
  writeFileSync(join(cwd, "AGENTS.md"), "# Mine\n<!-- cue-skills:start -->\nstale\n");
  syncAgentsMd(cwd);
  const t = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.equal(t.split("<!-- cue-skills:start -->").length, 2);
  assert.ok(t.includes("<!-- cue-skills:end -->") && !t.includes("stale") && t.startsWith("# Mine"));
  assert.ok(readFileSync(join(cwd, "AGENTS.md.bak"), "utf8").includes("stale"));
  syncAgentsMd(cwd);
  assert.ok(readFileSync(join(cwd, "AGENTS.md.bak"), "utf8").includes("stale"));
});
