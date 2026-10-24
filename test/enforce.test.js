import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCaveman, checkReply, CHECKERS } from "../src/enforce.js";

const words = (n, w = "tests pass") => Array(n).fill(w).join(" ");
const VERBOSE = "Sure, I'd be happy to help. Let me just take a look at the file and see what is going on. " +
  "Basically the function is really simple and I'll just make a small change to the loop. " +
  "Of course, the tests should actually pass after the change, and that is great.";

test("terse reply is ok", () => {
  const r = checkCaveman("Bug in loop. Off-by-one. Fixed bound. Tests pass. Run npm test to confirm. Nothing else changed in module.");
  assert.equal(r.ok, true);
  assert.ok(r.metrics.proseWords >= 20);
});

test("verbose reply drifts, reason format", () => {
  const r = checkCaveman(VERBOSE);
  assert.equal(r.ok, false);
  assert.match(r.reason, /^\d+\.\d% filler words \(\d+\/\d+\)$/);
  assert.ok(r.metrics.filler / r.metrics.proseWords > 0.04);
});

test("code-only and short replies are ok", () => {
  assert.equal(checkCaveman("```js\n" + "the a an just really ".repeat(50) + "\n```").ok, true);
  assert.equal(checkCaveman("Sure, just the a an really basically.").ok, true); // < 20 prose words
  assert.equal(checkCaveman("").ok, true);
});

test("fenced and inline code are stripped", () => {
  const code = "```\n" + "the the the the the the the the the the ".repeat(10) + "\n```\n";
  const r = checkCaveman(`Fixed bound check in loop. Tests pass now. Run again to confirm result of fix here ok. ${code} Use \`the a an just\` inline.`);
  assert.equal(r.ok, true);
  assert.equal(r.metrics.filler, 0);
  const prose = checkCaveman(words(30, "the")).metrics;
  assert.equal(prose.filler, 30);
});

test("checkReply dispatch", () => {
  assert.equal(checkReply("ponytail", VERBOSE), null);
  assert.equal(checkReply("nope", VERBOSE), null);
  assert.equal(checkReply("caveman", VERBOSE).ok, false);
  assert.deepEqual(Object.keys(CHECKERS), ["caveman"]);
});

// ~10 real replies sampled from bench/results/full-2026-10-19 (claude): none = uncompressed, manual/cue = caveman
test("calibration: none replies drift, caveman replies do not", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/replies.json", import.meta.url), "utf8"));
  const flagged = (mode) => {
    const rs = fx.filter((x) => x.mode === mode);
    return rs.filter((x) => !checkCaveman(x.reply).ok).length / rs.length;
  };
  assert.ok(fx.length >= 10);
  assert.ok(flagged("none") >= 0.75);
  assert.equal(flagged("manual"), 0);
  assert.equal(flagged("cue"), 0);
});
