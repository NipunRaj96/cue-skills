import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, symlinkSync, linkSync, rmSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "../src/engine.js";
import { scanRoots, buildCatalog } from "../src/catalog.js";
import { renderFull } from "../src/render.js";
import { syncAgentsMd } from "../src/sync.js";
import { select } from "../src/select.js";
import { projectRoot } from "../src/paths.js";
import { readRegular } from "../src/safefile.js";
import { trustCommand } from "../src/trust.js";
import { fixture, skill, rules, tmp } from "./helpers.js";

const BIN = fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url));
const T = { projectStatus: "trusted" };

function secretFile() {
  const f = join(tmp(), "id_rsa");
  writeFileSync(f, "---\nname: x\ndescription: d\n---\nTOP-SECRET\n");
  return f;
}

test("N1: leaf swapped for a symlink after the catalog is cached is not rendered", () => {
  const { cwd } = fixture();
  skill(join(cwd, ".claude/skills/x"), "x", "SAFE");
  rules(join(cwd, ".cue/rules.yaml"), "always: [x]\n");
  trustCommand(cwd);
  const go = () => run({ agent: "t", session: "s" + Math.random(), phase: "system", cwd }).text;
  assert.match(go(), /SAFE/); // catalog cached now
  const leaf = join(cwd, ".claude/skills/x/SKILL.md");
  rmSync(leaf);
  symlinkSync(secretFile(), leaf); // only x/ changes mtime: cache key is unchanged
  const t = go();
  assert.doesNotMatch(t, /TOP-SECRET/);
  assert.doesNotMatch(t, /SKILL\.md/); // rejected project entry: no Read line either
});

test("N1: hard-linked project SKILL.md is refused by catalog and render", () => {
  const { cwd } = fixture();
  const secret = secretFile();
  mkdirSync(join(cwd, ".claude/skills/x"), { recursive: true });
  linkSync(secret, join(cwd, ".claude/skills/x/SKILL.md"));
  assert.deepEqual(buildCatalog(scanRoots({ cwd, rules: T })), []);
  const e = { name: "x", path: join(cwd, ".claude/skills/x/SKILL.md"), kind: "project", base: cwd };
  assert.doesNotMatch(renderFull([e]), /TOP-SECRET/);
  assert.equal(readRegular(e.path, 1e6, { base: cwd, nofollow: true }), null);
  assert.ok(readRegular(secret, 1e6, {}).includes("TOP-SECRET")); // plain reads still work
});

test("N3: hard-linked AGENTS.md is refused by sync", () => {
  const { cwd } = fixture();
  const victim = join(tmp(), "v.md");
  writeFileSync(victim, "KEEP\n");
  linkSync(victim, join(cwd, "AGENTS.md"));
  assert.throws(() => syncAgentsMd(cwd), /hard-linked file, refusing/);
  assert.equal(readFileSync(victim, "utf8"), "KEEP\n");
});

test("N4: project marker symlinked outside the repo counts as absent", () => {
  const { cwd } = fixture();
  const outside = tmp();
  writeFileSync(join(outside, "secret"), "");
  symlinkSync(join(outside, "secret"), join(cwd, "link"));
  writeFileSync(join(cwd, "real"), "");
  const catalog = [{ name: "a", plugin: null, description: "", path: "/x", size: 1, kind: "user" }];
  const r = (m) => select({ cwd, catalog, rules: { always: [], never: [], when: [{ project: [m], use: ["a"] }] } }).selected.length;
  assert.equal(r("link"), 0);
  assert.equal(r("real"), 1);
});

test("budget: a huge trusted project cannot starve user skills", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/mine"), "mine");
  for (let i = 0; i < 20100; i++) mkdirSync(join(cwd, ".claude/skills", "d" + String(i).padStart(5, "0")), { recursive: true });
  assert.deepEqual(buildCatalog(scanRoots({ cwd, rules: T })).map((e) => e.name), ["mine"]);
});

test("projectRoot compares real paths against HOME (symlinked cwd)", () => {
  const { h } = fixture();
  mkdirSync(join(h, ".git"));
  mkdirSync(join(h, "work"));
  const link = join(tmp(), "link");
  symlinkSync(h, link);
  const cwd = join(link, "work");
  assert.equal(projectRoot(cwd), cwd);
});

test("status prints the project root's rules path, not the cwd's", () => {
  const { h, cwd } = fixture();
  mkdirSync(join(cwd, "sub"));
  const r = spawnSync(process.execPath, [BIN, "status"], { cwd: join(cwd, "sub"), env: { ...process.env, HOME: h } });
  assert.ok(r.stdout.toString().includes(`${join(cwd, ".cue/rules.yaml")} (project root)`));
});

test("R1: rejected project skill is omitted entirely (render and sync); user entries keep the Read line", () => {
  const { h, cwd } = fixture();
  const leaf = join(cwd, ".claude/skills/x/SKILL.md");
  mkdirSync(join(cwd, ".claude/skills/x"), { recursive: true });
  symlinkSync(secretFile(), leaf);
  const e = { name: "x", path: leaf, kind: "project", base: cwd };
  assert.equal(renderFull([e]), "");
  const u = { name: "u", path: join(h, "nope/SKILL.md"), kind: "user" };
  assert.match(renderFull([u]), /Read .*nope\/SKILL\.md and follow it/);
  rules(join(cwd, ".cue/rules.yaml"), "always: [x]\n");
  trustCommand(cwd);
  syncAgentsMd(cwd);
  assert.doesNotMatch(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /SKILL\.md|TOP-SECRET/);
});

test("TOCTOU: fd must match the path's dev/ino after realpath", () => {
  const { cwd } = fixture();
  const f = join(cwd, "a.md");
  writeFileSync(f, "hi");
  assert.equal(readRegular(f, 100, { base: cwd, nofollow: true }), "hi");
  const swapped = (p) => ({ ...statSync(p), ino: statSync(p).ino + 1 });
  assert.equal(readRegular(f, 100, { base: cwd, nofollow: true, stat: swapped }), null);
});
