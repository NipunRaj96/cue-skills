// Drift checkers for standing skills. checkReply(skill, text) -> {ok, reason, metrics} | null.

const FILLER = new Set(["a", "an", "the", "just", "really", "basically", "actually", "simply", "sure", "certainly", "happy", "i'd", "i'll", "great"]);
const PAIRS = ["of course", "let me"];

// Calibrated offline on bench/results/full-2026-10-19/runs.jsonl (gitignored; 459 rows, 451 with a reply).
// none = uncompressed, manual/cue = caveman. Share of replies flagged by `prose >= 20 && filler > t`:
//   t       none(all/claude)  manual(all/claude)  cue(all/claude)
//   0.02    89% / 95%          8% /  8%            22% / 0%
//   0.04    83% / 88%          3% /  3%            18% / 0%   <- chosen
//   0.06    78% / 85%          1% /  0%            11% / 0%
// 0.04 separates well on claude (the enforced agent); the cue "all" 18% is openclaw/opencode replies that
// really did drift (summary.md: openclaw cue t4 score 0.925). Length alone does not separate (caveman
// replies are mostly under 20 words), so it only counts together with filler.
const MIN_WORDS = 20;
const MAX_FILLER = 0.04;

export function checkCaveman(text) {
  const prose = String(text ?? "")
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .toLowerCase().replace(/[’‘]/g, "'");
  const w = prose.match(/[\p{L}\p{N}']+/gu) ?? [];
  let filler = w.filter((x) => FILLER.has(x)).length;
  const joined = ` ${w.join(" ")} `;
  for (const p of PAIRS) filler += joined.split(` ${p} `).length - 1;
  const proseWords = w.length;
  const ratio = proseWords ? filler / proseWords : 0;
  const drift = proseWords >= MIN_WORDS && ratio > MAX_FILLER;
  return {
    ok: !drift,
    reason: `${(ratio * 100).toFixed(1)}% filler words (${filler}/${proseWords})`,
    metrics: { proseWords, filler, ratio },
  };
}

export const CHECKERS = { caveman: checkCaveman };

export function checkReply(skill, text) {
  const c = Object.hasOwn(CHECKERS, skill) ? CHECKERS[skill] : null;
  return c ? c(text) : null;
}
