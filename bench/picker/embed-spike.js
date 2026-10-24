// Spike: BM25 vs nomic-embed-text (Ollama) vs hybrid. node bench/picker/embed-spike.js
// Variant/hybrid mode chosen on DEV only; holdout is read once at the end ("second look" for the non-chosen ones).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { collapse } from "../../src/catalog.js";
import { buildIndex, score, queryTerms } from "../../src/bm25.js";
import { queryParts, summarize } from "../../src/signals.js";

const here = (f) => new URL(`./${f}`, import.meta.url);
const json = (f) => JSON.parse(readFileSync(here(f)));
const CACHE = here(".embcache.json"), KS = [1, 3, 5, 8, 10];
const EXCL = new Set(["caveman", "ponytail"]);

// --- embeddings (Ollama) with disk cache
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE)) : {};
const key = (s) => createHash("sha1").update(s).digest("hex");
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const post = async (input) => {
  const r = await fetch("http://localhost:11434/api/embed", { method: "POST", body: JSON.stringify({ model: "nomic-embed-text", input }) });
  if (!r.ok) throw new Error(`ollama ${r.status} ${await r.text()}`);
  return (await r.json()).embeddings;
};
async function embed(texts) {
  const miss = [...new Set(texts.filter((t) => !cache[key(t)]))];
  for (let i = 0; i < miss.length; i += 16) {
    const chunk = miss.slice(i, i + 16);
    (await post(chunk)).forEach((e, j) => (cache[key(chunk[j])] = norm(e)));
  }
  if (miss.length) writeFileSync(CACHE, JSON.stringify(cache));
  return texts.map((t) => cache[key(t)]);
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// --- cards, queries
const cards = collapse(json("cards.json"));
const index = buildIndex(cards);
const ok = cards.map((c) => !c.invocable_only && !EXCL.has(c.name));
const words = (s, n) => String(s ?? "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
const docA = (c) => [c.name, c.description, c.when_to_use].filter(Boolean).join(". ");
const docB = (c) => `${docA(c)}\n${words(c.body, 300)}`;
const VARIANTS = { a: docA, b: docB };

// One query per case: prompt + every event signal + project summary (BM25 keeps the part weights).
function caseQuery(c) {
  const steps = [...(c.prompt ? [{ prompt: c.prompt }] : []), ...(c.events ?? []).map((e) => ({ tool: e.tool, file: e.file, failure: e.failure }))];
  const parts = steps.flatMap((s, n) => queryParts({ ...s, ...(n === 0 ? { project: summarize(c.project ?? {}) } : {}) }).parts);
  if (!c.prompt && c.project) parts.push({ text: summarize(c.project), weight: 0.5 });
  return { parts, text: [...new Set(parts.map((p) => p.text))].join(". ") };
}

// --- scoring: per case, arrays of length cards.length (NaN-free; filtered cards get -Infinity)
function bm25Scores(parts) {
  const s = cards.map(() => 0);
  for (const { i, score: v } of score(index, queryTerms(parts))) s[i] = v;
  return s;
}
const mask = (s) => s.map((v, i) => (ok[i] ? v : -Infinity));
const ranking = (s) => s.map((v, i) => [v, i]).filter(([v]) => v > -Infinity).sort((x, y) => y[0] - x[0] || x[1] - y[1]).map(([, i]) => i);

async function prepare(cases) {
  const qs = cases.map(caseQuery);
  const qe = await embed(qs.map((q) => "search_query: " + q.text));
  return cases.map((c, n) => ({ c, bm: bm25Scores(qs[n].parts), qe: qe[n] }));
}

// --- methods: each maps a prepared case to a score array. Hybrid constants come from DEV only.
const stats = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { m, s: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1 }; };
const allOk = (rows, f) => rows.flatMap((r) => f(r).filter((_, i) => ok[i]));
const rankScore = (s) => { const r = ranking(s), out = s.map(() => -Infinity); r.forEach((i, k) => (out[i] = 1 / (60 + k))); return out; }; // RRF-style
function makeMethods(devRows, docEmb) {
  const cos = (v) => (r) => mask(docEmb[v].map((d) => dot(d, r.qe)));
  const zb = stats(allOk(devRows, (r) => r.bm)), zc = {};
  for (const v in docEmb) zc[v] = stats(allOk(devRows, cos(v)));
  const m = { bm25: (r) => mask(r.bm) };
  for (const v in docEmb) {
    m[`emb-${v}`] = cos(v);
    m[`hyb-z-${v}`] = (r) => { const e = cos(v)(r); return mask(r.bm).map((b, i) => (b - zb.m) / zb.s + (e[i] - zc[v].m) / zc[v].s); };
    m[`hyb-rank-${v}`] = (r) => { const a = rankScore(mask(r.bm.map((x, i) => (x > 0 ? x : -Infinity)))), b = rankScore(cos(v)(r)); return a.map((x, i) => (x > -Infinity ? x : 0) + b[i]); };
  }
  return m;
}

// --- metrics
const positives = (rows) => rows.filter((r) => r.c.expect.length);
// rank (1-based) of the first expected skill among eligible cards; bm25 unscored cards count as not retrieved
const firstRank = (r, s, bmOnly) => {
  const rk = ranking(bmOnly ? s.map((v) => (v > 0 ? v : -Infinity)) : s).map((i) => cards[i].name);
  const p = rk.findIndex((n) => r.c.expect.includes(n));
  return p < 0 ? Infinity : p + 1;
};
const recall = (rows, f, bmOnly) => { const ps = positives(rows), rk = ps.map((r) => firstRank(r, f(r), bmOnly)); return KS.map((k) => rk.filter((x) => x <= k).length / ps.length); };
const top1 = (s) => Math.max(...s);
const pct = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const auc = (pos, neu) => { let w = 0; for (const p of pos) for (const n of neu) w += p > n ? 1 : p === n ? 0.5 : 0; return w / (pos.length * neu.length); };
function neutral(rows, f) {
  const t = rows.map((r) => ({ pos: r.c.expect.length > 0, v: top1(f(r)) }));
  const P = t.filter((x) => x.pos).map((x) => x.v), N = t.filter((x) => !x.pos).map((x) => x.v);
  return { auc: auc(P, N), pos: [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => pct(P, p)), neu: [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => pct(N, p)), nP: P.length, nN: N.length };
}

// --- main
const dev = await prepare(json("cases.json"));
const docEmb = {};
for (const v in VARIANTS) docEmb[v] = await embed(cards.map((c) => "search_document: " + VARIANTS[v](c)));
const methods = makeMethods(dev, docEmb);
const names = Object.keys(methods);
const f2 = (x) => x.toFixed(3), f3 = (xs) => xs.map(f2).join(" | ");
const isBm = (n) => n === "bm25";

// DEV selection: embedding doc variant by mean recall over K; hybrid mode by mean recall over K.
const meanR = (n) => { const r = recall(dev, methods[n], isBm(n)); return r.reduce((a, b) => a + b, 0) / r.length; };
const bestOf = (cands) => cands.reduce((a, b) => (meanR(b) > meanR(a) ? b : a));
const chosenEmb = bestOf(["emb-a", "emb-b"]), vOf = chosenEmb.slice(-1);
const chosenHyb = bestOf([`hyb-z-${vOf}`, `hyb-rank-${vOf}`]);
const chosen = ["bm25", chosenEmb, chosenHyb];

const hold = await prepare(json("holdout.json"));
const table = (rows, ns) => ns.map((n) => `| ${n}${chosen.includes(n) ? " *" : ""} | ${f3(recall(rows, methods[n], isBm(n)))} |`).join("\n");
const RH = `| method | ${KS.map((k) => "R@" + k).join(" | ")} |\n|---|${KS.map(() => "---").join("|")}|`;
const sepRow = (rows, n) => { const s = neutral(rows, methods[n]); return `| ${n} | ${f2(s.auc)} | ${s.pos.map(f2).join(" / ")} | ${s.neu.map(f2).join(" / ")} |`; };
const SH = "| method | AUC | positive top-1 p10/25/50/75/90 | neutral top-1 p10/25/50/75/90 |\n|---|---|---|---|";

// stitch / replicate cases
const special = (c) => /replicate|stitch/i.test(c.id) || /replicate|stitch/i.test(c.prompt ?? "");
const rankTable = (rows, label) => {
  const rs = rows.filter((r) => special(r.c) && r.c.expect.length), cols = ["bm25", "emb-a", "emb-b", chosenHyb];
  const rk = (r, n) => { const x = firstRank(r, methods[n](r), isBm(n)); return x === Infinity ? "miss" : x; };
  return `**${label}**\n\n| case | expect | ${cols.join(" | ")} |\n|---|---|${cols.map(() => "---").join("|")}|\n` +
    rs.map((r) => `| ${r.c.id} | ${r.c.expect.join(", ")} | ${cols.map((n) => rk(r, n)).join(" | ")} |`).join("\n");
};

// latency: single query, warm, median of 20, fresh strings so no cache is involved
await post(["search_query: warmup"]);
const lat = [];
for (let i = 0; i < 20; i++) { const t = performance.now(); await post([`search_query: build me a landing page for tool number ${i}`]); lat.push(performance.now() - t); }
const latMs = pct(lat, 0.5);

const evNeu = (rows) => `${rows.filter((r) => !r.c.expect.length).length} neutral`;
const md = `# Embedding recall spike (nomic-embed-text via Ollama)

Cards: ${cards.length} unique (${ok.filter(Boolean).length} eligible after dropping invocable_only, caveman, ponytail). Dev ${dev.length} cases (${positives(dev).length} positive, ${evNeu(dev)}), holdout ${hold.length} (${positives(hold).length} positive, ${evNeu(hold)}).
One query per case: prompt + all event signals + project summary. Doc variants: **a** = name+description+when_to_use, **b** = a + first 300 body words.
BM25 = existing scorer (unscored cards are not retrieved). hyb-z = z-score(BM25) + z-score(cosine), constants fit on dev pairs; hyb-rank = RRF-style 1/(60+rank) sum over both rankings.
Note: this is raw ranking recall with no thresholds, so it is not comparable to eval.js top1/hit (which also needs hi/lo/margin to fire). hyb-rank top-1 scores are rank-bounded, so its neutral AUC is not meaningful.
Selection on DEV only (mean recall over K): embedding variant -> **${chosenEmb}**, hybrid -> **${chosenHyb}**. \`*\` = chosen.

## DEV recall (positives, n=${positives(dev).length})

${RH}
${table(dev, names)}

## HOLDOUT recall (positives, n=${positives(hold).length}) - chosen methods

${RH}
${table(hold, chosen)}

### Second look at the holdout - the non-chosen methods (not used for any decision)

${RH}
${table(hold, names.filter((n) => !chosen.includes(n)))}

## Neutral separation (top-1 score, positives vs neutrals)

Scores are on different scales per method; AUC = P(positive top-1 > neutral top-1).

**DEV**

${SH}
${names.map((n) => sepRow(dev, n)).join("\n")}

**HOLDOUT**

${SH}
${names.map((n) => sepRow(hold, n)).join("\n")}

## Stitch / replicate-design cases (rank of first expected skill; miss = not retrieved)

${rankTable(dev, "DEV")}

${rankTable(hold, "HOLDOUT")}

## Query latency

Single \`/api/embed\` query, warm, median of 20: **${latMs.toFixed(1)} ms** (min ${Math.min(...lat).toFixed(1)}, max ${Math.max(...lat).toFixed(1)}).
`;
writeFileSync(here("embed-spike.md"), md);
console.log(md);
