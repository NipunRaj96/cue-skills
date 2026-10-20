import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, split } from "../bench/picker/eval.js";
import { THRESHOLDS } from "../src/pick.js";

const json = (f) => JSON.parse(readFileSync(new URL(`../bench/picker/${f}`, import.meta.url)));
const cards = json("cards.json"), cases = json("cases.json");
// first honest held-out run, 2026-10-20: top1 0.633, hit 0.633, falseFire 0.250 (2/8), forbidHits 1 (n=38)
const TOP1_FLOOR = 0.58, HIT_FLOOR = 0.58, FALSE_FIRE_CEIL = 0.30, FORBID_CEIL = 1;

test("eval data is well-formed", () => {
  const names = new Set(cards.map((c) => c.name));
  assert.ok(cases.length >= 100);
  for (const c of cases) for (const n of [...c.expect, ...(c.forbid ?? [])]) assert.ok(names.has(n), `${c.id}: ${n}`);
  assert.ok(cases.some((c) => c.id === "stitch-to-frontend"));
  assert.ok(cases.filter((c) => !c.expect.length).length >= 25);
});

test("split is 7/3 by index", () => {
  const s = split(cases);
  assert.equal(s.tune.length + s.test.length, cases.length);
  assert.equal(s.tune[0], cases[0]);
  assert.equal(s.test[0], cases[7]);
});

test("held-out picker metrics stay above the first honest run", () => {
  const m = evaluate(split(cases).test, cards, THRESHOLDS);
  // floors = first honest held-out run (Step 4) minus 0.05; falseFire ceiling = run plus 0.05
  assert.ok(m.top1 >= TOP1_FLOOR, `top1 ${m.top1}`);
  assert.ok(m.hit >= HIT_FLOOR, `hit ${m.hit}`);
  assert.ok(m.falseFire <= FALSE_FIRE_CEIL, `falseFire ${m.falseFire}`);
  assert.ok(m.forbidHits <= FORBID_CEIL, `forbidHits ${m.forbidHits}`);
});
