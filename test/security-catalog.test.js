import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, symlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scanRoots, buildCatalog } from "../src/catalog.js";
import { renderFull } from "../src/render.js";
import { loadRules } from "../src/rules.js";
import { trustCommand } from "../src/trust.js";
import { fixture, skill, rules, tmp } from "./helpers.js";

const T = { projectStatus: "trusted" };
const names = (c) => c.map((e) => e.name).sort();

test("project SKILL.md symlinked to an outside file is not cataloged (and not read)", () => {
  const { cwd } = fixture();
  const out = join(tmp(), "passwd");
  writeFileSync(out, "---\nname: leak\ndescription: secret\n---\nSECRET\n");
  mkdirSync(join(cwd, ".claude/skills/x"), { recursive: true });
  symlinkSync(out, join(cwd, ".claude/skills/x/SKILL.md"));
  skill(join(cwd, ".claude/skills/ok"), "ok");
  assert.deepEqual(names(buildCatalog(scanRoots({ cwd, rules: T }))), ["ok"]);
});

test("project symlinked skill dirs and symlinked skill roots are not followed", () => {
  const { cwd } = fixture();
  const outside = tmp();
  skill(join(outside, "s"), "outside");
  mkdirSync(join(cwd, ".claude/skills"), { recursive: true });
  symlinkSync(join(outside, "s"), join(cwd, ".claude/skills/linked"));
  mkdirSync(join(cwd, ".agents"));
  symlinkSync(outside, join(cwd, ".agents/skills")); // whole root is a link
  assert.deepEqual(buildCatalog(scanRoots({ cwd, rules: T })), []);
});

test("user roots may follow symlinks, but the target must be a regular file", () => {
  const { h, cwd } = fixture();
  const real = tmp();
  skill(join(real, "s"), "linked");
  mkdirSync(join(h, ".claude/skills"), { recursive: true });
  symlinkSync(join(real, "s"), join(h, ".claude/skills/linked"));
  assert.deepEqual(names(buildCatalog(scanRoots({ cwd }))), ["linked"]);
});

test("a FIFO SKILL.md is skipped (and does not hang)", () => {
  const { h, cwd } = fixture();
  mkdirSync(join(h, ".claude/skills/fifo"), { recursive: true });
  execFileSync("mkfifo", [join(h, ".claude/skills/fifo/SKILL.md")]);
  skill(join(h, ".claude/skills/ok"), "ok");
  assert.deepEqual(names(buildCatalog(scanRoots({ cwd }))), ["ok"]);
});

test("SKILL.md over 256 KB is skipped everywhere", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/big"), "big", "x".repeat(300 * 1024));
  skill(join(cwd, ".claude/skills/bigp"), "bigp", "x".repeat(300 * 1024));
  skill(join(h, ".claude/skills/ok"), "ok");
  assert.deepEqual(names(buildCatalog(scanRoots({ cwd, rules: T }))), ["ok"]);
});

test("render re-checks at read time: FIFO and oversized entries become Read lines", () => {
  const { h } = fixture();
  const fifo = join(h, "f.md");
  execFileSync("mkfifo", [fifo]);
  const big = join(h, "big.md");
  writeFileSync(big, "---\nname: b\n---\n" + "x".repeat(300 * 1024));
  const out = renderFull([{ name: "f", path: fifo }, { name: "b", path: big }], Infinity);
  assert.match(out, new RegExp(`## Skill: f\nRead ${fifo} and follow it`));
  assert.match(out, new RegExp(`## Skill: b\nRead ${big} and follow it`));
  assert.ok(out.length < 400);
});

test("project skillDirs: escapes, absolute, ~ and UNC rejected; inside accepted", () => {
  const { h, cwd } = fixture();
  rules(join(cwd, ".cue/rules.yaml"), 'skillDirs: ["../../outside", /etc, "~/x", "//host/share", "\\\\\\\\host\\\\s", ok]\n');
  trustCommand(cwd);
  const r = loadRules(cwd);
  assert.deepEqual(r.projectSkillDirs, [join(cwd, ".cue/ok")]);
  assert.equal(r.errors.length, 5);
  assert.match(r.errors[0], /escapes the project root/);
  rules(join(h, ".cue/rules.yaml"), 'skillDirs: ["//host/share", "/ok/abs", "~/fine"]\n');
  const g = loadRules(cwd);
  assert.deepEqual(g.skillDirs, ["/ok/abs", "~/fine"]);
  assert.match(g.errors.join("\n"), /host\/share: UNC paths are not allowed/);
});

test("project skillDir that is a symlink out of the repo is not scanned", () => {
  const { cwd } = fixture();
  const outside = tmp();
  skill(join(outside, "s"), "outside");
  mkdirSync(join(cwd, ".cue"), { recursive: true });
  symlinkSync(outside, join(cwd, ".cue/sk"));
  const roots = scanRoots({ cwd, rules: { ...T, projectSkillDirs: [join(cwd, ".cue/sk")] } });
  assert.deepEqual(roots.filter((r) => r.kind === "project"), []);
  assert.deepEqual(readdirSync(outside), ["s"]);
});
