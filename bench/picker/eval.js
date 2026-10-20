// Offline picker eval: node bench/picker/eval.js [--tune] [--tune-only]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collapse } from "../../src/catalog.js";
import { buildIndex } from "../../src/bm25.js";
import { queryParts, summarize } from "../../src/signals.js";
import { CAP_TOKENS, THRESHOLDS, pickStep, planInjection } from "../../src/pick.js";

const json = (f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url)));

export const split = (cases) => ({
  tune: cases.filter((_, i) => i % 10 < 7),
  test: cases.filter((_, i) => i % 10 >= 7),
});

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

export function tune(cases, cards) {
  const p = prep(cards);
  let best = null;
  for (let hi = 1; hi <= 15; hi += 0.5)
    for (let lo = 0.5; lo <= hi; lo += 0.5)
      for (const margin of [1.1, 1.25, 1.5, 2]) {
        const m = evalPrepped(cases, p, { hi, lo, margin });
        if (m.falseFire > 0.10 || m.forbidHits) continue;
        const obj = m.top1 + m.hit;
        if (!best || obj > best.obj + 1e-9 || (Math.abs(obj - best.obj) <= 1e-9 && (m.tokensPerCase < best.m.tokensPerCase - 1e-9 || (Math.abs(m.tokensPerCase - best.m.tokensPerCase) <= 1e-9 && hi > best.t.hi))))
          best = { obj, m, t: { hi, lo, margin } };
      }
  return best?.t ?? { ...THRESHOLDS };
}

const row = (name, m) => `| ${name} | ${m.n} | ${m.positives} | ${m.neutral} | ${m.top1.toFixed(3)} | ${m.hit.toFixed(3)} | ${m.falseFire.toFixed(3)} | ${m.forbidHits} | ${m.tokensPerCase.toFixed(0)} | ${m.listAllTokens} |`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cards = json("cards.json"), cases = json("cases.json"), { tune: tuneSet, test } = split(cases);
  let t = THRESHOLDS;
  if (process.argv.includes("--tune")) { t = tune(tuneSet, cards); console.log(`Tuned thresholds: ${JSON.stringify(t)}\n`); }
  console.log(`Thresholds: ${JSON.stringify(t)}\n`);
  console.log("| split | n | positives | neutral | top1 | hit | falseFire | forbidHits | tokensPerCase | listAllTokens |\n|---|---|---|---|---|---|---|---|---|---|");
  console.log(row("tune", evaluate(tuneSet, cards, t)));
  if (!process.argv.includes("--tune-only")) console.log(row("test", evaluate(test, cards, t))); // --tune-only: never look at held-out while tuning
  const stitch = cases.find((c) => c.id === "stitch-to-frontend");
  console.log(`\nstitch-to-frontend: ${JSON.stringify(runCase(stitch, prep(cards), t).injected)}`);
}
