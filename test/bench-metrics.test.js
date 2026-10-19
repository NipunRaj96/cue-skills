import test from "node:test";
import assert from "node:assert/strict";
import { cavemanScore, stripCode, tokenEstimate, turnMetrics, locFromNumstat, wordCount } from "../bench/metrics.js";

test("caveman_score: filler words lower the score", () => {
  assert.equal(cavemanScore("mutex lock thread"), 1);
  assert.equal(cavemanScore("the mutex"), 0.5);
  assert.equal(cavemanScore("Just a really simple lock"), 1 - 3 / 5);
});

test("caveman_score: code blocks are excluded, no prose gives null", () => {
  assert.equal(cavemanScore("lock it\n```js\nconst the = a;\n```\n"), 1);
  assert.equal(cavemanScore("```\nthe the the\n```"), null);
  assert.equal(stripCode("x ```unclosed the"), "x  ");
});

test("token estimate is ceil(chars/4)", () => {
  assert.equal(tokenEstimate(""), 0);
  assert.equal(tokenEstimate("abcde"), 2);
});

test("turnMetrics prefers real usage and flags estimates", () => {
  assert.deepEqual(turnMetrics("abcdefgh", 5), { out_tokens: 5, estimated: false, words: 1, caveman_score: 1, agent_steps: null, reply: "abcdefgh" });
  assert.equal(turnMetrics("abcdefgh", null).out_tokens, 2);
  assert.equal(turnMetrics("abcdefgh", null).estimated, true);
  assert.equal(wordCount(" a  b\nc "), 3);
});

test("locFromNumstat sums added lines", () => {
  assert.equal(locFromNumstat("3\t1\ta.js\n5\t0\tb.js\n-\t-\timg.png\n"), 8);
  assert.equal(locFromNumstat(""), 0);
});

test("turnMetrics stores steps and truncates reply to 2000 chars", () => {
  const m = turnMetrics("x".repeat(2500), 1, 3);
  assert.equal(m.agent_steps, 3);
  assert.equal(m.reply.length, 2000);
});
