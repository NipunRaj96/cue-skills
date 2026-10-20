import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, skill } from "./helpers.js";
import { loadRules } from "../src/rules.js";
import { scanRoots, loadAll, loadCatalog } from "../src/catalog.js";
import { tokenize, buildIndex, score, queryTerms } from "../src/bm25.js";

test("tokenize stems and drops stopwords", () => {
  assert.deepEqual(tokenize("Debugging failing tests in CSS files"), ["debug", "fail", "test", "css", "file"]);
  assert.deepEqual(tokenize("use the skill"), []);
});
const C = [
  { name: "frontend-design", description: "Create distinctive frontend interfaces", when_to_use: "" },
  { name: "systematic-debugging", description: "Use when encountering any bug or test failure", when_to_use: "" },
  { name: "notes", description: "design notes", when_to_use: "" },
];
test("score ranks by match; name outweighs description", () => {
  const ix = buildIndex(C);
  assert.equal(score(ix, queryTerms([{ text: "debug the failing test" }]))[0].i, 1);
  const r = score(ix, queryTerms([{ text: "design" }]));
  assert.deepEqual(r.map((x) => x.i), [0, 2]);
  assert.deepEqual(score(ix, queryTerms([{ text: "" }])), []);
});
test("query weight scales contribution", () => {
  const ix = buildIndex(C);
  const full = score(ix, queryTerms([{ text: "frontend" }]))[0].score;
  const half = score(ix, queryTerms([{ text: "frontend", weight: 0.5 }]))[0].score;
  assert.ok(Math.abs(half - full / 2) < 1e-9);
  assert.equal(queryTerms([{ text: "ui", weight: 0.5 }, { text: "ui" }]).get("ui"), 1);
});
test("catalog cache from v0.1 is rebuilt", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/a"), "a");
  const rules = loadRules(cwd);
  const key = JSON.stringify(scanRoots({ cwd, rules }).map((r) => [r.root, statSync(r.root).mtimeMs]));
  mkdirSync(join(h, ".cue"), { recursive: true });
  writeFileSync(join(h, ".cue/catalog.json"), JSON.stringify({ key, entries: [{ name: "a", path: "/x" }] }));
  const all = loadAll({ cwd, rules });
  assert.equal(all.cards[0].tokens > 0, true);
  assert.equal(all.index.N, 1);
  assert.equal(loadCatalog({ cwd, rules }).length, 1);
  assert.equal(JSON.parse(readFileSync(join(h, ".cue/catalog.json"), "utf8")).v, 3);
});
test("body terms count, weakly, and code fences and frontmatter are not indexed", () => {
  const B = [
    { name: "a", description: "alpha", when_to_use: "", body: "Use zebra stripes. ```js\nconst quokka = 1;\n``` after" },
    { name: "b", description: "beta", when_to_use: "", body: "" },
  ];
  const ix = buildIndex(B);
  assert.deepEqual(score(ix, queryTerms([{ text: "zebra" }])).map((x) => x.i), [0]);
  assert.deepEqual(score(ix, queryTerms([{ text: "alpha" }])).map((x) => x.i), [0]);
});
test("bodyText strips fences and caps words", async () => {
  const { bodyText, BODY_WORDS } = await import("../src/catalog.js");
  assert.equal(bodyText("keep\n```\nsecret\n```\nthis\n~~~\nopen fence runs to end"), "keep this");
  assert.equal(bodyText("w ".repeat(BODY_WORDS + 50)).split(" ").length, BODY_WORDS);
});
test("a skill body is indexed but not cached on cards", () => {
  const { h, cwd } = fixture();
  skill(join(h, ".claude/skills/a"), "a", "wombat habitat notes");
  skill(join(h, ".claude/skills/b"), "b", "nothing");
  const all = loadAll({ cwd, rules: loadRules(cwd) });
  assert.equal(all.cards[0].body, undefined);
  assert.equal(score(all.index, queryTerms([{ text: "wombat" }])).map((x) => all.cards[x.i].name).join(), "a");
});
