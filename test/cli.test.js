import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url));
const home = () => realpathSync(mkdtempSync(join(tmpdir(), "cue-cli-")));
const cue = (h, args, input = "", cwd = h) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { input, cwd, env: { ...process.env, HOME: h, PATH: "/usr/bin:/bin" } });
  return { status: r.status, out: r.stdout.toString(), err: r.stderr.toString() };
};

test("hook via CLI exits 0 on garbage", () => {
  const r = cue(home(), ["hook", "claude", "UserPromptSubmit"], "garbage");
  assert.equal(r.status, 0);
  assert.equal(r.out, "");
});

test("init installs detected, creates rules; uninstall removes", () => {
  const h = home();
  mkdirSync(join(h, ".claude"));
  let r = cue(h, ["init"]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /✓ Claude Code/);
  assert.match(readFileSync(join(h, ".claude/settings.json"), "utf8"), /cue-skills.*hook claude/);
  assert.ok(existsSync(join(h, ".cue/rules.yaml")));
  r = cue(h, ["uninstall"]);
  assert.equal(r.status, 0, r.err);
  assert.doesNotMatch(readFileSync(join(h, ".claude/settings.json"), "utf8"), /cue-skills hook/);
});

test("init: bad config continues and exits 1; --only restricts; unknown id fails", () => {
  const h = home();
  mkdirSync(join(h, ".claude"));
  mkdirSync(join(h, ".config/opencode"), { recursive: true });
  writeFileSync(join(h, ".claude/settings.json"), "{nope");
  let r = cue(h, ["init"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ Claude Code: .*invalid JSON/);
  assert.match(r.out, /✓ OpenCode/);
  const h2 = home();
  mkdirSync(join(h2, ".claude"));
  mkdirSync(join(h2, ".config/opencode"), { recursive: true });
  r = cue(h2, ["init", "--only", "opencode"]);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.out, /Claude Code/);
  assert.equal(cue(h2, ["init", "--only", "bogus"]).status, 1);
});

test("rules template activates nothing", () => {
  const h = home();
  cue(h, ["init"]);
  const r = cue(h, ["status"]);
  assert.doesNotMatch(r.out, /\bcaveman\b/);
});

test("status shows unresolved and stale plugin", () => {
  const h = home();
  mkdirSync(join(h, ".cue"));
  writeFileSync(join(h, ".cue/rules.yaml"), "always: [ghost]\n");
  mkdirSync(join(h, ".config/opencode/plugins"), { recursive: true });
  writeFileSync(join(h, ".config/opencode/plugins/cue-skills.js"), 'import("file:///nonexistent/engine.js")');
  const r = cue(h, ["status"]);
  assert.match(r.out, /ghost/);
  assert.match(r.out, /OpenCode\s+\S+\s+yes\s+experimental\s+yes/);
});

test("scan, list, why, sync, usage", () => {
  const h = home();
  mkdirSync(join(h, ".claude/skills/foo"), { recursive: true });
  writeFileSync(join(h, ".claude/skills/foo/SKILL.md"), "---\nname: foo\ndescription: does foo\n---\nbody\n");
  const proj = join(h, "proj");
  mkdirSync(join(proj, ".git"), { recursive: true });
  assert.match(cue(h, ["scan"], "", proj).out, /^1 skills/);
  assert.match(cue(h, ["list"], "", proj).out, /foo\s+\[-\]\s+does foo/);
  cue(h, ["hook", "claude", "UserPromptSubmit"], "{}");
  const why = cue(h, ["why"]);
  assert.equal(why.status, 0);
  assert.match(why.out, / claude prompt/);
  assert.match(cue(h, ["sync"], "", proj).out, /AGENTS\.md/);
  assert.match(cue(h, ["wat"]).out, /usage/i);
});

test("--version", () => {
  assert.equal(cue(home(), ["--version"]).out, "0.1.0\n");
  assert.equal(cue(home(), ["-v"]).out, "0.1.0\n");
});
