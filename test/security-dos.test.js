import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { matchGlob } from "../src/glob.js";
import { select } from "../src/select.js";
import { run } from "../src/engine.js";
import { readLog } from "../src/log.js";

import { fixture, skill, rules } from "./helpers.js";

// --- M6
test("ReDoS glob is rejected or fast", () => {
  const t = Date.now();
  const g = "**a**a**a**a**a**a**a**a**a**a**b";
  matchGlob(g, "a".repeat(40));
  assert.ok(Date.now() - t < 50);
});

test("glob: 1000-char path is linear; long pattern throws; long path dropped; real globs match", () => {
  const t = Date.now();
  assert.equal(matchGlob("**a**a**a**b", "a".repeat(1000)), false);
  assert.equal(matchGlob("*a*a*a*a*a*a*a*a*a*a*a*b", "a".repeat(1000)), false);
  assert.ok(Date.now() - t < 50);
  assert.throws(() => matchGlob("a".repeat(257), "a"), /256/);
  assert.equal(matchGlob("**", "a".repeat(1025)), false);
  assert.ok(matchGlob("**/*-*/**/*.*", "x/a-b/c/d.js"));
  assert.ok(matchGlob("**/*-*/**/*.*", "a-b/d.js"));
  assert.ok(!matchGlob("**/*-*/**/*.*", "x/ab/c/d.js"));
  assert.ok(matchGlob("**/src/**/*.test.*", "a/src/b/c.test.js"));
  assert.ok(matchGlob("src/**", "src/a/b") && !matchGlob("src/*", "src/a/b"));
});

test("select skips a bad glob, keeps going, records an error; engine logs it", () => {
  const { h, cwd } = fixture();
  const catalog = ["a", "b"].map((name) => ({ name, plugin: null, description: "", path: `/x/${name}`, size: 1, kind: "user" }));
  const bad = "a".repeat(300);
  const r = { always: [], never: [], projectNames: new Set(), when: [{ files: [bad], use: ["a"] }, { files: ["*.js"], use: ["b"] }] };
  const out = select({ files: [join(cwd, "x.js")], cwd, rules: r, catalog });
  assert.deepEqual(out.selected.map((s) => s.entry.name), ["b"]);
  assert.equal(out.errors.length, 1);
  skill(join(h, ".claude/skills/b"), "b");
  rules(join(h, ".cue/rules.yaml"), `when:\n  - files: ["${bad}"]\n    use: [b]\n`);
  run({ agent: "t", session: "g", phase: "tool", files: [join(cwd, "x.js")], cwd });
  assert.match(JSON.stringify(readLog(1)[0].errors), /256/);
});

