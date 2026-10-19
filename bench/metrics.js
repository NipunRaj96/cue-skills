// Per-turn metrics. Pure functions, stdlib only.
const FILLER = new Set(["a", "an", "the", "just", "really", "basically", "actually", "simply", "sure", "certainly", "happy"]);

export const stripCode = (s) => String(s ?? "").replace(/```[\s\S]*?(```|$)/g, " ");
export const tokenEstimate = (s) => Math.ceil(String(s ?? "").length / 4);
export const wordCount = (s) => (String(s ?? "").match(/\S+/g) ?? []).length;

const proseWords = (s) => (stripCode(s).toLowerCase().match(/[a-z']+/g) ?? []);

// 1 - share of prose words that are articles/filler; null when there is no prose
export function cavemanScore(reply) {
  const w = proseWords(reply);
  if (!w.length) return null;
  return 1 - w.filter((x) => FILLER.has(x)).length / w.length;
}

// sum of added lines from `git diff --numstat` output (binary "-" counts as 0)
export const locFromNumstat = (out) =>
  String(out ?? "").split("\n").reduce((n, l) => n + (parseInt(l.split("\t")[0], 10) || 0), 0);

export function turnMetrics(reply, usageOut, steps = null) {
  const estimated = !(Number.isFinite(usageOut) && usageOut >= 0);
  return {
    out_tokens: estimated ? tokenEstimate(reply) : usageOut,
    estimated,
    words: wordCount(reply),
    caveman_score: cavemanScore(reply),
    agent_steps: Number.isFinite(steps) ? steps : null,
    reply: String(reply ?? "").slice(0, 2000),
  };
}
