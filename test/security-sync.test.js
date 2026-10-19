import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { syncAgentsMd } from "../src/sync.js";
import { fixture, skill, rules, tmp } from "./helpers.js";

function setup() {
  const f = fixture();
  skill(join(f.h, ".claude/skills/caveman"), "caveman");
  rules(join(f.h, ".cue/rules.yaml"), "always: [caveman]\n");
  const outside = tmp();
  return { ...f, outside };
}

test("symlinked AGENTS.md is refused, target untouched, no .bak", () => {
  const { cwd, outside } = setup();
  const target = join(outside, "victim.md");
  writeFileSync(target, "SECRET\n");
  symlinkSync(target, join(cwd, "AGENTS.md"));
  assert.throws(() => syncAgentsMd(cwd), /AGENTS\.md: not a regular file, refusing/);
  assert.equal(readFileSync(target, "utf8"), "SECRET\n");
  assert.ok(!existsSync(join(cwd, "AGENTS.md.bak")) && !existsSync(target + ".bak"));
  assert.ok(lstatSync(join(cwd, "AGENTS.md")).isSymbolicLink());
});

test("symlinked .cursor directory pointing outside is refused, nothing created outside", () => {
  const { cwd, outside } = setup();
  symlinkSync(outside, join(cwd, ".cursor"));
  assert.throws(() => syncAgentsMd(cwd), /outside the project, refusing/);
  assert.deepEqual(readdirSync(outside), []);
  assert.ok(!existsSync(join(cwd, "AGENTS.md"))); // refused before anything was written
});

test("symlinked .cursor/rules directory (missing leaf) is refused", () => {
  const { cwd, outside } = setup();
  mkdirSync(join(cwd, ".cursor"));
  symlinkSync(outside, join(cwd, ".cursor/rules"));
  assert.throws(() => syncAgentsMd(cwd), /outside the project, refusing/);
  assert.deepEqual(readdirSync(outside), []);
});

test("symlinked cue-skills.mdc is refused and never backed up", () => {
  const { cwd, outside } = setup();
  mkdirSync(join(cwd, ".cursor/rules"), { recursive: true });
  const target = join(outside, "v.mdc");
  writeFileSync(target, "SECRET\n");
  symlinkSync(target, join(cwd, ".cursor/rules/cue-skills.mdc"));
  assert.throws(() => syncAgentsMd(cwd), /cue-skills\.mdc: not a regular file, refusing/);
  assert.equal(readFileSync(target, "utf8"), "SECRET\n");
  assert.deepEqual(readdirSync(join(cwd, ".cursor/rules")), ["cue-skills.mdc"]);
});

test("a planted tmp symlink is not written through", () => {
  const { cwd, outside } = setup();
  const target = join(outside, "v.txt");
  writeFileSync(target, "SECRET\n");
  symlinkSync(target, join(cwd, `AGENTS.md.tmp-${process.pid}`));
  assert.throws(() => syncAgentsMd(cwd), /EEXIST/);
  assert.equal(readFileSync(target, "utf8"), "SECRET\n");
});

test("regular files still sync, with .bak of the original", () => {
  const { cwd } = setup();
  writeFileSync(join(cwd, "AGENTS.md"), "mine\n");
  syncAgentsMd(cwd);
  assert.equal(readFileSync(join(cwd, "AGENTS.md.bak"), "utf8"), "mine\n");
  assert.match(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /## Skill: caveman/);
});
