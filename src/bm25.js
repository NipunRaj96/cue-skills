export const STOPWORDS = new Set(("a an the and or but if of in on at to for from by with as is are was were be been it its this that these those " +
  "i me my we our you your he she they them do does did can could should would will just please any all some use using used when skill skills user " +
  // conversational filler: never names a task
  "need needs want wants like make makes get gets got let lets pls plz thanks thank think new help how what why who where which not no so up out about into then than there here now one also more very really too only still yes ok okay go going done has have had am each every other another such same both few most many much thing things").split(" "));

const stem = (w) => {
  const m = /^(.{3,})(ing|ed)$/.exec(w);
  if (m) return /([b-df-hj-np-tv-z])\1$/.test(m[1]) && !/(ll|ss|zz)$/.test(m[1]) ? m[1].slice(0, -1) : m[1];
  if (/^.{2,}(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (/^.{2,}[^aeiou]ies$/.test(w)) return w.slice(0, -3) + "y";
  return !w.endsWith("ss") && w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
};

export const tokenize = (text) =>
  String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t)).map(stem);

export function queryTerms(parts) {
  const m = new Map();
  for (const { text, weight = 1 } of parts) for (const t of tokenize(text)) m.set(t, Math.max(m.get(t) ?? 0, weight));
  return m;
}

// BM25F-style: body terms count BODY_W each, the body is capped at BODY_WORDS words (see catalog.bodyText),
// so a long body cannot swamp length normalisation. tf and len are weighted (fractional).
export const BODY_W = 0.3;

export function buildIndex(cards) {
  const df = {}, docs = cards.map((c) => {
    const tf = {};
    let len = 0;
    const add = (text, w, reps = 1) => {
      for (const t of tokenize(text)) { tf[t] = (tf[t] ?? 0) + w * reps; len += w * reps; }
    };
    add(c.name, 1, 3); add(c.description, 1); add(c.when_to_use, 1); add(c.body, BODY_W);
    for (const t in tf) df[t] = (df[t] ?? 0) + 1;
    return { len, tf };
  });
  const N = docs.length;
  return { N, avgdl: N ? docs.reduce((s, d) => s + d.len, 0) / N : 0, df, docs };
}

export function score({ N, avgdl, df, docs }, terms) {
  const k1 = 1.2, b = 0.75, out = [];
  docs.forEach((d, i) => {
    let s = 0;
    for (const [t, w] of terms) {
      const f = d.tf[t];
      if (!f) continue;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      s += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgdl));
    }
    if (s > 0) out.push({ i, score: s });
  });
  return out.sort((x, y) => y.score - x.score || x.i - y.i);
}
