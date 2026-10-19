import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";

import { projectRoot } from "../src/paths.js";
import { loadRules } from "../src/rules.js";
import { trustCommand } from "../src/trust.js";

import { fixture, rules, tmp } from "./helpers.js";

// --- M7
test("a .git in a world-writable parent outside HOME is not the project root", () => {
  fixture();
  const outside = tmp();
  mkdirSync(join(outside, "repo/.git"), { recursive: true });
  mkdirSync(join(outside, "repo/sub"));
  assert.equal(projectRoot(join(outside, "repo/sub")), join(outside, "repo")); // control
  chmodSync(outside, 0o777);
  assert.equal(projectRoot(join(outside, "repo/sub")), join(outside, "repo/sub"));
});

test("projectRoot never reaches $HOME or above", () => {
  const { h } = fixture();
  mkdirSync(join(h, ".git"));
  mkdirSync(join(h, "work/deep"), { recursive: true });
  assert.equal(projectRoot(join(h, "work/deep")), join(h, "work/deep"));
});

test("a .git owned by another uid is ignored", () => {
  const { cwd } = fixture();
  const real = process.getuid;
  process.getuid = () => real() + 1;
  try { assert.equal(projectRoot(join(cwd, "sub")), join(cwd, "sub")); } finally { process.getuid = real; }
  assert.equal(projectRoot(cwd), cwd);
});

test("project rules file owned by another uid is ignored", () => {
  const { cwd } = fixture();
  rules(join(cwd, ".cue/rules.yaml"), "always: [x]\n");
  trustCommand(cwd);
  const real = process.getuid;
  process.getuid = () => real() + 1;
  try {
    const r = loadRules(cwd);
    assert.deepEqual(r.always, []);
    assert.match(r.errors.join("\n"), /owned by another user/);
  } finally { process.getuid = real; }
});

