import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { globToRegExp } from "../src/glob.js";
import { select } from "../src/select.js";
import { run } from "../src/engine.js";
import { readLog } from "../src/log.js";

import { fixture, skill, rules } from "./helpers.js";

// --- M6
test("ReDoS glob is rejected or fast", () => {
  const t = Date.now();
  const g = "**a**a**a**a**a**a**a**a**a**a**b";
  try { globToRegExp(g).test("a".repeat(40)); } catch { /* rejected */ }
  assert.ok(Date.now() - t < 50);
});

test("glob limits: star runs collapse, 5 stars / 11 wildcards / 257 chars throw", () => {
  assert.equal(globToRegExp("a*****b").source, globToRegExp("a**b").source);
  assert.throws(() => globToRegExp("*a*a*a*a*b"), /star wildcards/);
  assert.throws(() => globToRegExp("?".repeat(11)), /more than 10 wildcards/);
  assert.throws(() => globToRegExp("a".repeat(257)), /256/);
  assert.ok(globToRegExp("**/src/**/*.test.*").test("a/src/b/c.test.js"));
});

test("select skips a bad glob, keeps going, records an error; engine logs it", () => {
  const { h, cwd } = fixture();
  const catalog = ["a", "b"].map((name) => ({ name, plugin: null, description: "", path: `/x/${name}`, size: 1, kind: "user" }));
  const bad = "**a**a**a**a**a**a**a**a**a**a**b";
  const r = { always: [], never: [], projectNames: new Set(), when: [{ files: [bad], use: ["a"] }, { files: ["*.js"], use: ["b"] }] };
  const out = select({ files: [join(cwd, "x.js")], cwd, rules: r, catalog });
  assert.deepEqual(out.selected.map((s) => s.entry.name), ["b"]);
  assert.equal(out.errors.length, 1);
  skill(join(h, ".claude/skills/b"), "b");
  rules(join(h, ".cue/rules.yaml"), `when:\n  - files: ["${bad}"]\n    use: [b]\n`);
  run({ agent: "t", session: "g", phase: "tool", files: [join(cwd, "x.js")], cwd });
  assert.match(JSON.stringify(readLog(1)[0].errors), /wildcards/);
});

