import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "cue-rules-"));
process.env.HOME = join(tmp, "home");
mkdirSync(join(tmp, "home/.cue"), { recursive: true });
const { loadRules } = await import("../src/rules.js");
const { select } = await import("../src/select.js");

const names = ["caveman", "ponytail", "frontend-design", "a", "b", "uni"];
const catalog = names.map((name) => ({ name, plugin: null, description: "", path: `/x/${name}/SKILL.md`, size: 1, kind: "user" }));
const rule = (o) => ({ always: [], never: [], when: [], skillDirs: [], errors: [], ...o });
const sel = (o) => select({ cwd: tmp, catalog, ...o });
const picked = (r) => r.selected.map((s) => s.entry.name);
const newProj = (n) => { const p = join(tmp, n); mkdirSync(join(p, ".git"), { recursive: true }); return p; };
const globalFile = join(tmp, "home/.cue/rules.yaml");

test("always + never + order", () => {
  const r = rule({ always: ["caveman", "ponytail"], never: ["ponytail"] });
  assert.deepEqual(picked(sel({ rules: r })), ["caveman"]);
});

test("prompt whole-word: 'ui' not in 'build'", () => {
  const r = rule({ when: [{ prompt: ["ui"], use: ["frontend-design"] }] });
  assert.equal(sel({ prompt: "build it", rules: r }).selected.length, 0);
  assert.equal(sel({ prompt: "fix the UI", rules: r }).selected[0].reason, 'prompt:"ui"');
});

test("prompt phrase and unicode boundary", () => {
  const r = rule({ when: [{ prompt: ["landing page", "c++"], use: ["a"] }, { prompt: ["é"], use: ["uni"] }] });
  assert.deepEqual(picked(sel({ prompt: "make a Landing  Page", rules: r })), []); // double space is not the phrase
  assert.deepEqual(picked(sel({ prompt: "make a Landing Page", rules: r })), ["a"]);
  assert.deepEqual(picked(sel({ prompt: "c++ fix", rules: r })), ["a"]);
  assert.deepEqual(picked(sel({ prompt: "café", rules: r })), []);
  assert.deepEqual(picked(sel({ prompt: "un é ok", rules: r })), ["uni"]);
});

test("files glob relative to project root", () => {
  const root = newProj("p1");
  const r = rule({ when: [{ files: ["**/*.tsx"], use: ["frontend-design"] }] });
  const out = select({ files: [join(root, "src/a.tsx")], cwd: root, rules: r, catalog });
  assert.equal(out.selected[0].reason, "files:**/*.tsx");
  assert.equal(select({ files: [join(root, "src/a.ts")], cwd: root, rules: r, catalog }).selected.length, 0);
});

test("project marker", () => {
  const root = newProj("p2");
  writeFileSync(join(root, "next.config.js"), "");
  const r = rule({ when: [{ project: ["next.config.js"], use: ["frontend-design"] }] });
  assert.equal(select({ cwd: root, rules: r, catalog }).selected[0].reason, "project:next.config.js");
  assert.equal(select({ cwd: newProj("p3"), rules: r, catalog }).selected.length, 0);
});

test("combined rule: any matches, first reason in order prompt, files, project", () => {
  const root = newProj("p4");
  writeFileSync(join(root, "m"), "");
  const r = rule({ when: [{ prompt: ["ui"], files: ["**/*.css"], project: ["m"], use: ["a"] }] });
  assert.equal(select({ prompt: "ui", files: [join(root, "x.css")], cwd: root, rules: r, catalog }).selected[0].reason, 'prompt:"ui"');
  assert.equal(select({ files: [join(root, "x.css")], cwd: root, rules: r, catalog }).selected[0].reason, "files:**/*.css");
  assert.equal(select({ cwd: root, rules: r, catalog }).selected[0].reason, "project:m");
});

test("first reason wins, dedup, always reason", () => {
  const r = rule({ always: ["a"], when: [{ prompt: ["x"], use: ["a", "b"] }] });
  const out = sel({ prompt: "x", rules: r }).selected.map((s) => [s.entry.name, s.reason]);
  assert.deepEqual(out, [["a", "always"], ["b", 'prompt:"x"']]);
});

test("unresolved names reported", () => {
  assert.deepEqual(sel({ rules: rule({ always: ["ghost"] }) }).unresolved, ["ghost"]);
});

test("malformed yaml -> errors, no throw", () => {
  writeFileSync(globalFile, "always: [");
  const r = loadRules(tmp);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /rules\.yaml: /);
  assert.deepEqual(r.always, []);
});

test("project rules append to global, dedupe, skillDirs", () => {
  const root = newProj("p5");
  mkdirSync(join(root, ".cue"));
  writeFileSync(globalFile, "always: [a]\nnever: n\nskillDirs: ~/s\n");
  writeFileSync(join(root, ".cue/rules.yaml"), "always: [b, a]\nwhen:\n  - prompt: ui\n    use: frontend-design\n");
  const r = loadRules(root);
  assert.deepEqual(r.always, ["a", "b"]);
  assert.deepEqual(r.never, ["n"]);
  assert.deepEqual(r.skillDirs, ["~/s"]);
  assert.deepEqual(r.when, [{ prompt: ["ui"], files: [], project: [], use: ["frontend-design"] }]);
  assert.deepEqual(r.errors, []);
});

test("missing files empty; bad types collect errors", () => {
  const root = newProj("p6");
  mkdirSync(join(root, ".cue"));
  writeFileSync(globalFile, "");
  writeFileSync(join(root, ".cue/rules.yaml"), "always: 5\nwhen: [{use: {x: 1}}]\n");
  const r = loadRules(root);
  assert.deepEqual(r.always, []);
  assert.equal(r.errors.length, 2);
  assert.equal(loadRules(newProj("p7")).errors.length, 0);
});

test("when without use errors; relative skillDirs resolve against rules file", () => {
  const root = newProj("p8");
  mkdirSync(join(root, ".cue"));
  writeFileSync(globalFile, "");
  writeFileSync(join(root, ".cue/rules.yaml"), "skillDirs: [local, /abs, ~/h]\nwhen:\n  - prompt: ui\n");
  const r = loadRules(root);
  assert.deepEqual(r.skillDirs, [join(root, ".cue/local"), "/abs", "~/h"]);
  assert.match(r.errors.join("\n"), /when\[0\]: missing use/);
});

test("files outside the project are ignored", () => {
  const root = newProj("p9");
  const r = sel({ cwd: root, rules: rule({ when: [{ files: ["**"], use: ["a"] }] }), files: [join(root, "../x.js")] });
  assert.deepEqual(picked(r), []);
  assert.deepEqual(picked(sel({ cwd: root, rules: rule({ when: [{ files: ["**"], use: ["a"] }] }), files: [join(root, "x.js")] })), ["a"]);
});
