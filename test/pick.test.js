import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { buildIndex } from "../src/bm25.js";
import { decide, pickStep, planInjection, renderPlan } from "../src/pick.js";

const card = (name, tokens = 100, extra = {}) => ({ name, description: `about ${name}`, path: `/s/${name}/SKILL.md`, tokens, kind: "user", ...extra });
const S = (...xs) => xs.map(([n, s, tk]) => ({ card: card(n, tk), score: s }));
test("decide: confident, shortlist, none", () => {
  fixture();
  const t = { hi: 5, lo: 2, margin: 1.5 };
  assert.equal(decide(S(["a", 9], ["b", 5]), t).kind, "confident");
  const sl = decide(S(["a", 6], ["b", 5], ["c", 3], ["d", 2.5]), t);
  assert.equal(sl.kind, "shortlist");
  assert.deepEqual(sl.picks.map((c) => c.name), ["a", "b", "c"]);
  assert.equal(decide(S(["a", 1.9]), t).kind, "none");
  assert.equal(decide([], t).kind, "none");
});
test("pickStep excludes invocable_only and excluded names", () => {
  fixture();
  const cards = [card("frontend-design", 100, { when_to_use: "", invocable_only: true }), card("design-taste", 100, { when_to_use: "" })];
  const index = buildIndex(cards);
  const d = pickStep({ cards, index, parts: [{ text: "frontend design taste", weight: 1 }], thresholds: { hi: 0.1, lo: 0.05, margin: 1 } });
  assert.deepEqual(d.picks.map((c) => c.name), ["design-taste"]);
  assert.equal(pickStep({ cards, index, parts: [{ text: "design taste" }], exclude: new Set(["design-taste"]), thresholds: { hi: 0.1, lo: 0.05, margin: 1 } }).kind, "none");
});
test("planInjection: body over 1500 tokens becomes a card; cap respected", () => {
  fixture();
  assert.equal(planInjection({ kind: "confident", picks: [card("a", 1400)] }).items[0].mode, "full");
  assert.equal(planInjection({ kind: "confident", picks: [card("a", 1501)] }).items[0].mode, "card");
  assert.equal(planInjection({ kind: "confident", picks: [card("a", 900)] }, { cap: 500 }).items[0].mode, "card");
  assert.deepEqual(planInjection({ kind: "confident", picks: [card("a", 900)] }, { cap: 5 }).items, []);
  const p = planInjection({ kind: "shortlist", picks: [card("a"), card("b")] });
  assert.deepEqual(p.items.map((i) => i.mode), ["list", "list"]);
  assert.ok(p.tokens < 80);
});
test("renderPlan copy and project path check", () => {
  fixture();
  const txt = renderPlan(planInjection({ kind: "shortlist", picks: [card("a"), card("b")] }));
  assert.equal(txt, "Relevant skills; read the file of the one that fits.\n- a: about a (/s/a/SKILL.md)\n- b: about b (/s/b/SKILL.md)\n");
  assert.equal(renderPlan({ items: [{ card: card("p", 10, { kind: "project", base: "/nope" }), mode: "card" }], tokens: 0 }), "");
});
