import { score, queryTerms } from "./bm25.js";
import { renderFull } from "./render.js";
import { readChecked } from "./safefile.js";
import { MAX_SKILL } from "./catalog.js";

// Tuned 2026-10-20 on the tune split only (bench/picker, grid in eval.js): top1 0.614, hit 0.671, falseFire 0.095, forbidHits 0.
export const THRESHOLDS = { hi: 15, lo: 6, margin: 2 };
export const CAP_TOKENS = 2000, BODY_MAX_TOKENS = 1500, SHORTLIST_MAX = 3;
export const SHORTLIST_HEADER = "Relevant skills; read the file of the one that fits.";

const squash = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const toks = (s) => Math.ceil(s.length / 4);

export function decide(scored, t = THRESHOLDS) {
  const [top, next] = scored;
  if (top && top.score >= t.hi && top.score >= t.margin * (next?.score ?? 0)) return { kind: "confident", picks: [top.card] };
  const picks = scored.filter((x) => x.score >= t.lo).slice(0, SHORTLIST_MAX).map((x) => x.card);
  return picks.length ? { kind: "shortlist", picks } : { kind: "none", picks: [] };
}

export function pickStep({ cards, index, parts, exclude = new Set(), thresholds = THRESHOLDS }) {
  const scored = score(index, queryTerms(parts)).map(({ i, score: s }) => ({ card: cards[i], score: s }))
    .filter(({ card }) => !card.invocable_only && !exclude.has(card.name));
  return decide(scored, thresholds);
}

export const cardBlock = (c) => `## Skill: ${c.name}\n${squash(c.description, 160)}\nRead ${c.path} and follow it.\n`;
export const listLine = (c) => `- ${c.name}: ${squash(c.description, 100)} (${c.path})`;

export function planInjection(decision, { cap = CAP_TOKENS } = {}) {
  const items = [];
  let tokens = 0;
  if (decision.kind === "confident") {
    const card = decision.picks[0];
    const full = card.tokens + 15, small = toks(cardBlock(card));
    if (card.tokens <= BODY_MAX_TOKENS && full <= cap) { items.push({ card, mode: "full" }); tokens = full; }
    else if (small <= cap) { items.push({ card, mode: "card" }); tokens = small; }
  } else if (decision.kind === "shortlist") {
    const head = toks(SHORTLIST_HEADER + "\n");
    if (head <= cap) {
      tokens = head;
      for (const card of decision.picks) {
        const c = toks(listLine(card) + "\n");
        if (tokens + c > cap) break;
        items.push({ card, mode: "list" });
        tokens += c;
      }
      if (!items.length) tokens = 0;
    }
  }
  return { items, tokens };
}

export function renderPlan({ items }) {
  const ok = (c) => c.kind !== "project" || readChecked(c.path, MAX_SKILL, { base: c.base || "\0", nofollow: true }).data !== undefined;
  const lines = [];
  let out = "";
  for (const { card, mode } of items) {
    if (mode === "full") out += renderFull([card], Infinity);
    else if (!ok(card)) continue;
    else if (mode === "card") out += cardBlock(card);
    else lines.push(listLine(card));
  }
  return lines.length ? `${out}${SHORTLIST_HEADER}\n${lines.join("\n")}\n` : out;
}
