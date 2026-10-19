import test from "node:test";
import assert from "node:assert/strict";
import { completeSessions, pruneIncomplete, summarize } from "../bench/run.js";

const row = (turn, extra = {}) => ({ agent: "a", mode: "cue", task: "t", repeat: 1, turn, out_tokens: 10, ...extra });

test("complete session is kept, partial and errored ones are dropped", () => {
  const rows = [
    row(1), row(2), row(3), row(4),
    { ...row(1), repeat: 2 }, { ...row(2), repeat: 2 },
    { ...row(1), repeat: 3 }, { ...row(2), repeat: 3, error: "timeout" },
  ];
  const done = completeSessions(rows, 4);
  assert.deepEqual([...done], ["a|cue|t|1"]);
  assert.equal(pruneIncomplete(rows, done).length, 4);
});

test("turn cap lowers the bar for completeness", () => {
  assert.equal(completeSessions([row(1)], 1).size, 1);
  assert.equal(completeSessions([row(1)], 2).size, 0);
});

test("summary shows token change against none", () => {
  const rows = [];
  for (let t = 1; t <= 4; t++) {
    rows.push({ ...row(t, { mode: "none", out_tokens: 100, caveman_score: 0.8 }) });
    rows.push({ ...row(t, { mode: "cue", out_tokens: 50, caveman_score: 0.95 }) });
  }
  const s = summarize(rows);
  assert.match(s, /\| cue \| 1 \| 50\.0 \| 50\.0 \| 0\.950/);
  assert.match(s, /-50\.0%/);
});
