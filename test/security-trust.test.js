import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, statSync, symlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRules } from "../src/rules.js";
import { trustCommand, sha } from "../src/trust.js";
import { run } from "../src/engine.js";
import { fixture, skill, rules, tmp } from "./helpers.js";

const BIN = fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url));

test("project rules need trust; edit revokes; revoke command; trusted.json is 0600", () => {
  const { h, cwd } = fixture();
  const f = join(cwd, ".cue/rules.yaml");
  rules(f, "always: [evil]\n");
  assert.deepEqual([loadRules(cwd).projectStatus, loadRules(cwd).always], ["untrusted", []]);
  trustCommand(cwd);
  assert.deepEqual([loadRules(cwd).projectStatus, loadRules(cwd).always], ["trusted", ["evil"]]);
  assert.equal(statSync(join(h, ".cue/trusted.json")).mode & 0o777, 0o600);
  writeFileSync(f, "always: [evil2]\n");
  assert.deepEqual([loadRules(cwd).projectStatus, loadRules(cwd).always], ["changed", []]);
  trustCommand(cwd);
  assert.equal(loadRules(cwd).projectStatus, "trusted");
  trustCommand(cwd, true);
  assert.equal(loadRules(cwd).projectStatus, "untrusted");
});

test("no project rules file: status none", () => {
  const { cwd } = fixture();
  assert.equal(loadRules(cwd).projectStatus, "none");
  assert.throws(() => trustCommand(cwd), /nothing to trust/);
});

test("symlinked or oversized project rules file is ignored even when its hash is trusted", () => {
  const { h, cwd } = fixture();
  const out = join(tmp(), "evil.yaml");
  writeFileSync(out, "always: [evil]\n");
  mkdirSync(join(cwd, ".cue"));
  symlinkSync(out, join(cwd, ".cue/rules.yaml"));
  mkdirSync(join(h, ".cue"), { recursive: true });
  writeFileSync(join(h, ".cue/trusted.json"), JSON.stringify({ [cwd]: sha("always: [evil]\n") }));
  const r = loadRules(cwd);
  assert.deepEqual(r.always, []);
  assert.match(r.errors.join("\n"), /not a regular file/);
  assert.throws(() => trustCommand(cwd), /not a regular file/);

  const big = fixture();
  rules(join(big.cwd, ".cue/rules.yaml"), "always: [x]\n#" + "x".repeat(65 * 1024));
  assert.match(loadRules(big.cwd).errors.join("\n"), /larger than 64 KB/);
});

test("project never cannot remove global always/when; it can remove what the project added", () => {
  const { h, cwd } = fixture();
  rules(join(h, ".cue/rules.yaml"), "always: [g]\nwhen:\n  - prompt: x\n    use: [gw]\n");
  rules(join(cwd, ".cue/rules.yaml"), "always: [p]\nnever: [g, gw, p]\n");
  trustCommand(cwd);
  const r = loadRules(cwd);
  assert.deepEqual(r.never, ["p"]);
  assert.match(r.errors.join("\n"), /never: g: ignored/);
});

test("project skill named like a global one cannot hijack it (trusted or not)", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/ponytail"), "ponytail", "GOOD");
  skill(join(cwd, ".agents/skills/aaa"), "ponytail", "EVIL");
  rules(join(h, ".cue/rules.yaml"), "always: [ponytail]\n");
  rules(join(cwd, ".cue/rules.yaml"), "always: [other]\n");
  skill(join(cwd, ".agents/skills/other"), "other", "OTHER");
  const text = () => run({ agent: "t", session: "s" + Math.random(), phase: "system", cwd }).text;
  assert.match(text(), /GOOD/);
  assert.doesNotMatch(text(), /EVIL|OTHER/);
  trustCommand(cwd);
  const t = text();
  assert.match(t, /GOOD/);
  assert.doesNotMatch(t, /EVIL/);
  assert.match(t, /OTHER/); // names the project itself introduced do resolve from project roots
});

test("project rules naming a global skill: the user skill wins even when the project also ships it", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/dup"), "dup", "USER");
  skill(join(cwd, ".agents/skills/dup"), "dup", "PROJ");
  rules(join(h, ".cue/rules.yaml"), "always: [dup]\n");
  rules(join(cwd, ".cue/rules.yaml"), "always: [dup]\n");
  trustCommand(cwd);
  assert.match(run({ agent: "t", session: "d", phase: "system", cwd }).text, /USER/);
});

test("CLI: trust, status hint, duplicate-name warning, revoke", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/a"), "twin");
  skill(join(h, ".agents/skills/b"), "twin");
  rules(join(cwd, ".cue/rules.yaml"), "always: [twin]\n");
  const cue = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, HOME: h } }).stdout.toString();
  assert.match(cue("status"), /project rules: untrusted.*run: cue-skills trust/);
  assert.match(cue("status"), /warning: skill name "twin" appears 2 times/);
  assert.match(cue("trust"), /^trusted /);
  assert.match(cue("status"), /project rules: trusted/);
  assert.match(cue("trust", "--revoke"), /^revoked /);
  assert.match(cue("status"), /project rules: untrusted/);
  assert.match(readFileSync(join(h, ".cue/trusted.json"), "utf8"), /^\{\}/);
});
