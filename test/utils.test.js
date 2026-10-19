import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, chmodSync, statSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkill } from "../src/frontmatter.js";
import { globToRegExp } from "../src/glob.js";
import { projectRoot, expandHome, cueDir, home } from "../src/paths.js";
import { readJson, writeJson } from "../src/jsonfile.js";
import { syncAgentsMd } from "../src/sync.js";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "cue-")));

test("parseSkill splits frontmatter", () => {
  const { meta, body } = parseSkill("---\nname: caveman\ndescription: terse\n---\n# Body\n");
  assert.equal(meta.name, "caveman");
  assert.equal(body.trim(), "# Body");
});
test("parseSkill without frontmatter", () => {
  assert.deepEqual(parseSkill("hi").meta, {});
  assert.equal(parseSkill("hi").body, "hi");
});
test("globToRegExp", () => {
  assert.ok(globToRegExp("**/*.tsx").test("src/a/b.tsx"));
  assert.ok(globToRegExp("**/*.tsx").test("b.tsx"));
  assert.ok(!globToRegExp("*.tsx").test("src/b.tsx"));
  assert.ok(!globToRegExp("**/*.css").test("a.cssx"));
  assert.ok(globToRegExp("a?.js").test("ab.js"));
  assert.ok(!globToRegExp("a?.js").test("a/.js"));
  assert.ok(!globToRegExp("a.js").test("axjs"));
});
test("projectRoot finds .git ancestor", () => {
  const t = tmp();
  mkdirSync(join(t, "a", ".git"), { recursive: true });
  mkdirSync(join(t, "a", "b", "c"), { recursive: true });
  assert.equal(projectRoot(join(t, "a", "b", "c")), join(t, "a"));
});
test("projectRoot falls back to cwd", () => {
  const t = tmp();
  assert.equal(projectRoot(t), t);
});
test("home paths are lazy", () => {
  const old = process.env.HOME;
  process.env.HOME = "/x/y";
  try {
    assert.equal(home(), "/x/y");
    assert.equal(cueDir(), "/x/y/.cue");
    assert.equal(expandHome("~/a"), "/x/y/a");
    assert.equal(expandHome("/a"), "/a");
  } finally { process.env.HOME = old; }
});
test("readJson fallback and invalid", () => {
  const t = tmp();
  assert.deepEqual(readJson(join(t, "no.json"), { a: 1 }), { a: 1 });
  writeFileSync(join(t, "bad.json"), "{");
  assert.throws(() => readJson(join(t, "bad.json"), {}));
});
test("writeJson makes .bak once, atomic, mkdir -p", () => {
  const t = tmp();
  const p = join(t, "d", "e", "f.json");
  writeJson(p, { v: 1 });
  assert.equal(existsSync(p + ".bak"), false);
  assert.equal(readFileSync(p, "utf8"), '{\n  "v": 1\n}\n');
  writeJson(p, { v: 2 });
  writeJson(p, { v: 3 });
  assert.deepEqual(JSON.parse(readFileSync(p + ".bak", "utf8")), { v: 1 });
  assert.deepEqual(readJson(p), { v: 3 });
});

test("writeJson keeps mode and symlinks", () => {
  const d = tmp();
  writeFileSync(join(d, "a.json"), "{}");
  chmodSync(join(d, "a.json"), 0o600);
  writeJson(join(d, "a.json"), { x: 1 });
  assert.equal(statSync(join(d, "a.json")).mode & 0o777, 0o600);
  writeFileSync(join(d, "real.json"), "{}");
  symlinkSync(join(d, "real.json"), join(d, "link.json"));
  writeJson(join(d, "link.json"), { y: 2 });
  assert.ok(lstatSync(join(d, "link.json")).isSymbolicLink());
  assert.deepEqual(readJson(join(d, "real.json")), { y: 2 });
});

test("AGENTS.md sync keeps mode of a regular file", () => {
  const d = tmp();
  process.env.HOME = d;
  mkdirSync(join(d, "p/.git"), { recursive: true });
  writeFileSync(join(d, "p/AGENTS.md"), "mine\n");
  chmodSync(join(d, "p/AGENTS.md"), 0o600);
  syncAgentsMd(join(d, "p"));
  assert.equal(statSync(join(d, "p/AGENTS.md")).mode & 0o777, 0o600);
  assert.match(readFileSync(join(d, "p/AGENTS.md"), "utf8"), /^mine\n[\s\S]*cue-skills:start/);
});
