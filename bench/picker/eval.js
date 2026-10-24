// Offline picker eval: node bench/picker/eval.js [--tune | --holdout]
// default: dev set (cases.json) only. --tune: grid-search on the dev set, never reads holdout.json. --holdout: blind set metrics.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collapse } from "../../src/catalog.js";
import { buildIndex } from "../../src/bm25.js";
import { queryParts, summarize } from "../../src/signals.js";
import { CAP_TOKENS, THRESHOLDS, pickStep, planInjection } from "../../src/pick.js";

const json = (f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url)));

const prep = (cards) => { const c = collapse(cards); return { cards: c, index: buildIndex(c) }; };

// One turn: prompt step, then one step per event; the token cap is shared by all steps.
export function runCase(c, { cards, index }, thresholds) {
  const exclude = new Set(["caveman", "ponytail"]);
  const steps = [...(c.prompt ? [{ prompt: c.prompt }] : []), ...(c.events ?? []).map((e) => ({ tool: e.tool, file: e.file, failure: e.failure }))];
  const injected = [];
  let spent = 0;
  steps.forEach((s, n) => {
    const { parts } = queryParts({ ...s, ...(n === 0 ? { project: summarize(c.project ?? {}) } : {}) });
    const decision = pickStep({ cards, index, parts, exclude, thresholds });
    const plan = planInjection(decision, { cap: CAP_TOKENS - spent });
    if (!plan.items.length) return;
    spent += plan.tokens;
    const picks = plan.items.map((i) => i.card.name);
    picks.forEach((p) => exclude.add(p));
    injected.push({ kind: decision.kind, picks, tokens: plan.tokens });
  });
  return { injected };
}

const evalPrepped = (cases, p, thresholds) => {
  let pos = 0, neu = 0, top1 = 0, hit = 0, fire = 0, forbidHits = 0, tokens = 0;
  for (const c of cases) {
    const { injected } = runCase(c, p, thresholds);
    const all = injected.flatMap((i) => i.picks);
    tokens += injected.reduce((s, i) => s + i.tokens, 0);
    if (all.some((n) => (c.forbid ?? []).includes(n))) forbidHits++;
    if (c.expect.length) {
      pos++;
      if (injected[0] && c.expect.includes(injected[0].picks[0])) top1++;
      if (all.some((n) => c.expect.includes(n))) hit++;
    } else {
      neu++;
      if (injected.length) fire++;
    }
  }
  return {
    n: cases.length, positives: pos, neutral: neu,
    top1: pos ? top1 / pos : 0, hit: pos ? hit / pos : 0, falseFire: neu ? fire / neu : 0, forbidHits,
    tokensPerCase: cases.length ? tokens / cases.length : 0,
    listAllTokens: p.cards.reduce((s, c) => s + Math.ceil(`${c.name}: ${c.description}`.length / 4), 0),
  };
};

export const evaluate = (cases, cards, thresholds) => evalPrepped(cases, prep(cards), thresholds);

// Objective: hit@shortlist (any expected skill among the injected picks), then top1, then fewer tokens, then higher hi, then higher margin (a full body needs a clear lone winner).
// Constraints: falseFire <= FALSE_FIRE_MAX (a shortlist is about 70 tokens), forbidHits <= 1. Dev set only.
export const FALSE_FIRE_MAX = 0.20;
const better = (m, t, b) => {
  if (!b) return true;
  for (const [x, y] of [[m.hit, b.m.hit], [m.top1, b.m.top1], [b.m.tokensPerCase, m.tokensPerCase], [t.hi, b.t.hi], [t.margin, b.t.margin]])
    if (Math.abs(x - y) > 1e-9) return x > y;
  return false;
};

export function tune(cases, cards) {
  const p = prep(cards);
  let best = null;
  for (let hi = 8; hi <= 60; hi += 4)
    for (let lo = 0.5; lo <= hi; lo += 0.25)
      for (const margin of [1.1, 1.25, 1.5, 2]) {
        const t = { hi, lo, margin }, m = evalPrepped(cases, p, t);
        if (m.falseFire > FALSE_FIRE_MAX || m.forbidHits > 1) continue;
        if (better(m, t, best)) best = { m, t };
      }
  return best?.t ?? { ...THRESHOLDS };
}

const row = (name, m) => `| ${name} | ${m.n} | ${m.positives} | ${m.neutral} | ${m.top1.toFixed(3)} | ${m.hit.toFixed(3)} | ${m.falseFire.toFixed(3)} | ${m.forbidHits} | ${m.tokensPerCase.toFixed(0)} | ${m.listAllTokens} |`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cards = json("cards.json"), HEAD = "| set | n | positives | neutral | top1 | hit | falseFire | forbidHits | tokensPerCase | listAllTokens |\n|---|---|---|---|---|---|---|---|---|---|";
  const holdout = process.argv.includes("--holdout"), tuning = process.argv.includes("--tune");
  let t = THRESHOLDS;
  const dev = json("cases.json");
  if (tuning) { t = tune(dev, cards); console.log(`Tuned thresholds: ${JSON.stringify(t)}\n`); }
  console.log(`Thresholds: ${JSON.stringify(t)}\n\n${HEAD}`);
  console.log(row("dev", evaluate(dev, cards, t)));
  if (holdout && !tuning) { // the only code path that reads holdout.json
    const h = json("holdout.json");
    console.log(row("holdout", evaluate(h, cards, t)));
    const rep = h.filter((c) => /replicate/i.test(c.id) || /replicate/i.test(c.prompt ?? "") || /stitch/i.test(c.id));
    for (const c of rep) console.log(`${c.id}: expect ${JSON.stringify(c.expect)} -> ${JSON.stringify(runCase(c, prep(cards), t).injected)}`);
  }
}
