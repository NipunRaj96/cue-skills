import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate } from "../bench/picker/eval.js";
import { THRESHOLDS } from "../src/pick.js";

const json = (f) => JSON.parse(readFileSync(new URL(`../bench/picker/${f}`, import.meta.url)));
const cards = json("cards.json"), cases = json("cases.json");
// dev set (tuned on): regression guard only. shortlist-first, falseFire <= 0.20 objective: top1 0.480, hit@shortlist 0.540, falseFire 0.172, forbidHits 4 (n=129)
// floors = value - 0.05, ceilings = value + 0.05; the forbidHits ceiling equals the run value (forbidHits is reported, not tuned against).
const DEV = { top1: 0.43, hit: 0.49, falseFire: 0.22, forbidHits: 4 };

test("eval data is well-formed", () => {
  const names = new Set(cards.map((c) => c.name));
  assert.ok(cases.length >= 100);
  for (const c of cases) for (const n of [...c.expect, ...(c.forbid ?? [])]) assert.ok(names.has(n), `${c.id}: ${n}`);
  assert.ok(cases.some((c) => c.id === "stitch-to-frontend"));
  assert.ok(cases.filter((c) => !c.expect.length).length >= 25);
  assert.ok(cards.every((c) => typeof c.body === "string" && !c.body.includes("/Users/")));
});

test("dev picker metrics stay above the final tuned run (regression guard)", () => {
  const m = evaluate(cases, cards, THRESHOLDS);
  assert.ok(m.top1 >= DEV.top1, `top1 ${m.top1}`);
  assert.ok(m.hit >= DEV.hit, `hit ${m.hit}`);
  assert.ok(m.falseFire <= DEV.falseFire, `falseFire ${m.falseFire}`);
  assert.ok(m.forbidHits <= DEV.forbidHits, `forbidHits ${m.forbidHits}`);
});

// held-out set, third look (n=70, 52 positive, 18 neutral): top1 0.481, hit@shortlist 0.635, falseFire 0.333 (6/18), forbidHits 6. Not blind any more.
// floors = value - 0.05, ceiling = value + 0.05, forbidHits ceiling = the run value. The set is never used for tuning.
test("held-out picker metrics stay above the third look", () => {
  const m = evaluate(json("holdout.json"), cards, THRESHOLDS);
  assert.ok(m.top1 >= 0.43, `top1 ${m.top1}`);
  assert.ok(m.hit >= 0.58, `hit ${m.hit}`);
  assert.ok(m.falseFire <= 0.38, `falseFire ${m.falseFire}`);
  assert.ok(m.forbidHits <= 6, `forbidHits ${m.forbidHits}`);
});
