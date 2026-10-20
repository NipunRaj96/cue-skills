import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate } from "../bench/picker/eval.js";
import { THRESHOLDS } from "../src/pick.js";

const json = (f) => JSON.parse(readFileSync(new URL(`../bench/picker/${f}`, import.meta.url)));
const cards = json("cards.json"), cases = json("cases.json");
// dev set (tuned on): regression guard only. final dev run 2026-10-20: top1 0.280, hit 0.300, falseFire 0.069, forbidHits 0 (n=129)
const DEV = { top1: 0.23, hit: 0.25, falseFire: 0.12 };

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
  assert.equal(m.forbidHits, 0);
});

// blind held-out set, run once 2026-10-20 (n=70, 52 positive, 18 neutral): top1 0.365, hit 0.385, falseFire 0.167 (3/18), forbidHits 1.
// floors = value - 0.05, ceiling = value + 0.05. The set is never used for tuning.
test("held-out picker metrics stay above the one blind run", () => {
  const m = evaluate(json("holdout.json"), cards, THRESHOLDS);
  assert.ok(m.top1 >= 0.31, `top1 ${m.top1}`);
  assert.ok(m.hit >= 0.33, `hit ${m.hit}`);
  assert.ok(m.falseFire <= 0.22, `falseFire ${m.falseFire}`);
  assert.ok(m.forbidHits <= 1, `forbidHits ${m.forbidHits}`);
});
