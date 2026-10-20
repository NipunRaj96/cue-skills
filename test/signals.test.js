import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.js";
import { queryParts, testFailure, summarize, projectSummary } from "../src/signals.js";

test("tool and file expansion with label", () => {
  const q = queryParts({ tool: "mcp__stitch__get_screen" });
  assert.equal(q.label, "design task");
  assert.match(q.parts.map((p) => p.text).join(" "), /design ui replicate/);
  assert.match(q.parts.map((p) => p.text).join(" "), /stitch get screen/);
  assert.equal(queryParts({ tool: "Edit", file: "src/App.tsx" }).label, "frontend file");
  assert.equal(queryParts({ tool: "Read", file: "src/a.test.js" }).label, "test file");
  assert.equal(queryParts({ prompt: "hi" }).label, "prompt");
  assert.deepEqual(queryParts({ tool: "Read", file: "src/a.js" }).parts, []);
  assert.equal(queryParts({ prompt: "x", project: "frontend ui" }).parts.find((p) => p.text === "frontend ui").weight, 0.5);
  assert.equal(queryParts({ tool: "Bash", failure: true }).label, "test failure");
});
test("testFailure needs a runner, failure output, and no zero exit", () => {
  assert.equal(testFailure({ command: "npm test", output: "# fail 2\nnot ok 3 - x", exitCode: 1 }), true);
  assert.equal(testFailure({ command: "npm test", output: "2 failed", exitCode: null }), true);
  assert.equal(testFailure({ command: "npm test", output: "2 failed", exitCode: 0 }), false);
  assert.equal(testFailure({ command: "ls", output: "2 failed", exitCode: 1 }), false);
  assert.equal(testFailure({ command: "pytest", output: "all good", exitCode: 1 }), false);
});
test("summarize maps deps and markers, never raw names", () => {
  assert.equal(summarize({ deps: ["react", "tailwindcss", "left-pad"], markers: ["tsconfig.json"] }), "frontend ui css design typescript");
});
test("projectSummary reads package.json safely", () => {
  const { h, cwd } = fixture();
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "1" } }));
  assert.equal(projectSummary(cwd), "frontend ui");
  rmSync(join(cwd, "package.json"));
  writeFileSync(join(h, "outside.json"), JSON.stringify({ dependencies: { react: "1" } }));
  symlinkSync(join(h, "outside.json"), join(cwd, "package.json"));
  assert.equal(projectSummary(cwd), "");
  rmSync(join(cwd, "package.json"));
  writeFileSync(join(cwd, "package.json"), "{nope");
  assert.equal(projectSummary(cwd), "");
});
