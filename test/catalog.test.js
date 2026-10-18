import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRoots, buildCatalog, loadCatalog, resolve } from "../src/catalog.js";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "cue-")));
const skill = (dir, name, desc = "d", raw) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), raw ?? `---\nname: ${name}\ndescription: ${desc}\n---\nbody\n`);
};

function fixture() {
  const h = tmp();
  process.env.HOME = h;
  const cwd = join(h, "proj");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  return { h, cwd };
}

test("only latest plugin version scanned", () => {
  const { h, cwd } = fixture();
  for (const v of ["5.1.0", "7.0.0", "6.4.1"])
    skill(join(h, ".claude/plugins/cache/m/superpowers", v, "skills/brainstorming"), "brainstorming");
  const roots = scanRoots({ cwd });
  assert.ok(roots.some((r) => r.root.includes("7.0.0")));
  assert.ok(!roots.some((r) => r.root.includes("6.4.1") || r.root.includes("5.1.0")));
});

test("semver is numeric: 10.0.0 beats 9.0.0", () => {
  const { h, cwd } = fixture();
  for (const v of ["9.0.0", "10.0.0"]) skill(join(h, ".claude/plugins/cache/m/p", v, "skills/x"), "x");
  const roots = scanRoots({ cwd });
  assert.ok(roots.some((r) => r.root.includes("10.0.0")) && !roots.some((r) => r.root.includes("/9.0.0/")));
});

test("resolve prefers project > user > plugin; plugin:name exact", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/caveman"), "caveman");
  skill(join(h, ".claude/plugins/cache/m/caveman/1.0.0/skills/caveman"), "caveman");
  skill(join(cwd, ".claude/skills/proj-only"), "proj-only");
  skill(join(cwd, ".claude/skills/caveman"), "caveman");
  const cat = buildCatalog(scanRoots({ cwd }));
  assert.equal(resolve(cat, "caveman").kind, "project");
  assert.equal(resolve(cat, "caveman:caveman").kind, "plugin");
  assert.equal(resolve(cat, "caveman:caveman").plugin, "caveman");
  assert.equal(resolve(cat, "nope"), null);
  const noProj = cat.filter((e) => e.kind !== "project");
  assert.equal(resolve(noProj, "caveman").kind, "user");
});

test("name falls back to folder; bad yaml skipped; symlink cycle safe; node_modules skipped", () => {
  const { h, cwd } = fixture();
  const root = join(h, ".claude/skills");
  skill(join(root, "folder-name"), null, null, "no frontmatter\n");
  skill(join(root, "broken"), null, null, "---\nname: [oops\n---\nx\n");
  skill(join(root, "node_modules/dep"), "dep");
  skill(join(root, "a"), "a");
  symlinkSync(root, join(root, "a/loop"));
  const cat = buildCatalog(scanRoots({ cwd }));
  assert.deepEqual(cat.map((e) => e.name).sort(), ["a", "folder-name"]);
});

test("loadCatalog caches and rebuilds on mtime change", () => {
  const { h, cwd } = fixture();
  const root = join(h, ".claude/skills");
  skill(join(root, "one"), "one");
  assert.deepEqual(loadCatalog({ cwd }).map((e) => e.name), ["one"]);
  // poison cache entries: same key must be served from cache
  skill(join(root, "two"), "two");
  const t = new Date(Date.now() + 5000);
  utimesSync(root, t, t);
  assert.deepEqual(loadCatalog({ cwd }).map((e) => e.name), ["one", "two"]);
});
