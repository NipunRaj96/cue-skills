import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slope } from "../bench/metrics.js";
import { summarizeDrift } from "../bench/run.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test("slope: exact line, flat, noisy", () => {
  close(slope([[1, 1], [2, 3], [3, 5]]), 2);
  close(slope([[1, 0.9], [2, 0.8], [3, 0.7]]), -0.1);
  close(slope([[1, 4], [2, 4], [3, 4]]), 0);
  close(slope([[1, 1], [2, 3], [3, 2]]), 0.5);
});

test("slope: null y dropped, degenerate input is null", () => {
  close(slope([[1, 1], [2, null], [3, 3]]), 1);
  assert.equal(slope([]), null);
  assert.equal(slope([[1, 5]]), null);
  assert.equal(slope([[2, 1], [2, 3]]), null);
  assert.equal(slope([[1, null], [2, null]]), null);
});

const row = (agent, mode, turn, cs, tok, extra = {}) =>
  ({ suite: "drift", agent, mode, task: "t", repeat: 1, turn, caveman_score: cs, out_tokens: tok, ...extra });

test("summarizeDrift: per-turn table, slopes, compaction status", () => {
  const rows = [];
  for (let t = 1; t <= 4; t++) {
    rows.push(row("claude", "manual", t, 1 - 0.1 * t, 100 * t)); // decays, tokens grow
    rows.push(row("claude", "cue", t, 0.9, 50));                 // holds
  }
  rows.push({ suite: "drift", agent: "claude", mode: "cue", task: "t", repeat: 1, turn: 0, after_turn: 2, compaction: "ok" });
  rows.push({ suite: "drift", agent: "openclaw", mode: "cue", task: "t", repeat: 1, turn: 0, skipped: "boom", error: "boom" });
  const md = summarizeDrift(rows);
  assert.match(md, /^# Cue drift summary/);
  assert.match(md, /\| turn \| manual caveman \| manual out_tokens \| cue caveman \| cue out_tokens \|/);
  assert.match(md, /\| 1 \| 0\.900 \| 100 \| 0\.900 \| 50 \|/);
  assert.match(md, /\| 4 \| 0\.600 \| 400 \| 0\.900 \| 50 \|/);
  assert.match(md, /\| manual \| 1 \| -0\.1000 \| 100\.00 \|/);
  assert.match(md, /\| cue \| 1 \| 0\.0000 \| 0\.00 \|/);
  assert.match(md, /Compaction: cue: ok \(after turn 2\)/);
  assert.match(md, /## openclaw\n\nSkipped: boom/);
});

test("summarizeDrift: missing cells render as -, errored turns are ignored", () => {
  const md = summarizeDrift([row("a", "none", 1, 0.8, 10), row("a", "none", 3, null, 30), row("a", "none", 2, 0.1, 99, { error: "x" })]);
  assert.match(md, /\| 2 \| - \| - \|/);
  assert.match(md, /\| 3 \| - \| 30 \|/);
});

test("drift task: 12 turns, compaction after 6, prompts never ask for brevity or style", () => {
  const dir = new URL("../bench/drift/cache-session/", import.meta.url);
  const { turns, compactAfter } = JSON.parse(readFileSync(new URL("task.json", dir), "utf8"));
  assert.equal(turns.length, 12);
  assert.equal(compactAfter, 6);
  const banned = /\b(brief|briefly|concise|concisely|short|shortly|terse|succinct|compact|caveman|style|tone|words?|sentences?|bullet|tl;?dr|one-line|verbose)\b/i;
  for (const p of turns) assert.doesNotMatch(p, banned, p);
});
