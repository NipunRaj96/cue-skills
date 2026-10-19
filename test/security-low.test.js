import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, chmodSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { run } from "../src/engine.js";

import { loadRules } from "../src/rules.js";
import { trustCommand } from "../src/trust.js";
import { MARK } from "../src/adapters/hooksjson.js";
import { fixture, skill, rules } from "./helpers.js";
const mode = (p) => statSync(p).mode & 0o777;

// --- L12
test("uninstall marker matches only Cue's own command", () => {
  assert.ok(!MARK.test("my-cue-skills-wrapper hook"));
  assert.ok(!MARK.test("node /x/not-cue-skills.js hook claude"));
  assert.ok(MARK.test("cue-skills hook claude"));
  assert.ok(MARK.test(`"/usr/bin/node" "/x/bin/cue-skills.js" hook claude Stop`)); // old double-quoted form
  assert.ok(MARK.test(`'/usr/bin/node' '/x/bin/cue-skills.js' hook claude Stop`)); // new single-quoted form
  assert.ok(MARK.test("node /x/cue-skills hook"));
});

// --- L13
test("~/.cue is 0700 (also when it pre-exists wider); state, log, trusted files are 0600", () => {
  const { h, cwd } = fixture();
  mkdirSync(join(h, ".cue"), { mode: 0o755 });
  chmodSync(join(h, ".cue"), 0o755);
  skill(join(h, ".claude/skills/a"), "a");
  rules(join(h, ".cue/rules.yaml"), "always: [a]\n");
  run({ agent: "t", session: "p", phase: "start", cwd });
  assert.equal(mode(join(h, ".cue")), 0o700);
  assert.equal(mode(join(h, ".cue/log.jsonl")), 0o600);
  assert.equal(mode(join(h, ".cue/catalog.json")), 0o600);
  const st = join(h, ".cue/state");
  assert.deepEqual(readdirSync(st).map((f) => mode(join(st, f))), [0o600]);
  rules(join(cwd, ".cue/rules.yaml"), "always: [a]\n");
  trustCommand(cwd);
  assert.equal(mode(join(h, ".cue/trusted.json")), 0o600);
});

test("fresh ~/.cue is created 0700", () => {
  const { h, cwd } = fixture();
  run({ agent: "t", session: "p", phase: "start", cwd });
  assert.equal(mode(join(h, ".cue")), 0o700);
});

// --- L14
test("project: markers that are absolute or contain .. are rejected with an error", () => {
  const { h, cwd } = fixture();
  rules(join(h, ".cue/rules.yaml"), "when:\n  - project: [/etc/passwd, ../x, a/../b, ~/k, ok.json]\n    use: [a]\n");
  const r = loadRules(cwd);
  assert.deepEqual(r.when[0].project, ["ok.json"]);
  assert.equal(r.errors.length, 4);
});

// --- L9
test("yaml dependency is pinned exactly", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies.yaml, "2.9.1");
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].dependencies.yaml, "2.9.1");
});
