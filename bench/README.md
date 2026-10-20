# Cue benchmark

Measures token effect, drift and harm of Cue across agents. Spec: `docs/superpowers/specs/2026-10-19-benchmark-design.md`. Not shipped in the npm package.

```
node bench/run.js [--agents a,b] [--modes none,manual,cue] [--tasks t1,t2] [--repeats N] [--turns N] [--out dir]
```

Agents: `claude`, `opencode`, `openclaw`, `antigravity`, `codex`. Sequential only (`~/.cue/rules.yaml` is global; it is backed up to `/tmp/cue-bench/rules.yaml.bak` and restored at exit, Ctrl-C included). Runs live in `/tmp/cue-bench/`. `--turns N` caps turns per session, for smoke runs.

Output goes to `bench/results/<timestamp>/` (`runs.jsonl`, `summary.md`). Rerun with the same `--out` to resume: finished sessions are skipped, a failed or partial session restarts from turn 1.

Notes:
- Claude Code runs always disable the user's own caveman and ponytail plugins through `--settings`, so only the mode under test injects them.
- Codex runs use an isolated `CODEX_HOME=/tmp/cue-bench/codex-home`. Its `cue` mode is skipped: headless Codex does not run untrusted hooks.
- OpenClaw uses a dedicated `cue-bench` agent whose workspace is a symlink, `/tmp/cue-bench/oc-ws`, repointed at each run dir.
- `out_tokens` comes from agent usage and includes tool-call turns; `words` and `caveman_score` use the final reply only. Antigravity and Codex report cumulative usage per session; the harness takes deltas.

## Drift suite

```
node bench/run.js --suite drift [--agents a,b] [--modes none,manual,cue] [--repeats N] [--turns N] [--out dir]
```

Answers: over a long session, does a skill pasted once by hand (`manual`) decay while Cue (`cue`) holds it? Tasks live in `bench/drift/<id>/` (`repo/`, `task.json` with `turns` and `compactAfter`). The one task, `cache-session`, has 12 explanation/review/commit-message turns and two small code edits, and no prompt mentions brevity or style. Rows in `runs.jsonl` have the usual shape plus `suite: "drift"`.

After turn `compactAfter` (6) the harness compacts the agent's context where it can. That step records no metrics: only a `turn: 0` row with `compaction: "ok" | "failed: ..." | "unsupported"`. A failed or unsupported compaction does not stop the session.

`summary.md` has, per agent, a table with turns 1 to 12 as rows and `caveman_score` / `out_tokens` of each mode as columns, then the per-mode least-squares slope of `caveman_score` (and `out_tokens`) against turn. A negative `caveman_score` slope means drift.

| Agent | Compaction | How |
|---|---|---|
| Claude Code | verified | `ollama launch claude --model <m> -y -- -p "/compact" --settings <s> --output-format json -c` (empty result, no usage, session continues) |
| Antigravity | verified | `agy -p "/compact" --conversation <id> --model <m> --output-format json --sandbox` (empty response; `/compact` is listed by agy as a slash command) |
| OpenCode | verified, needs a server | no CLI command; `opencode serve` then `POST /session/<id>/summarize {providerID, modelID}`; later `opencode run -c` continues the compacted session |
| OpenClaw | unverified, not used | `/compact` is handled by the chat auto-reply layer, and the `openclaw agent` path does not appear to route it; skipped, recorded as `unsupported` |
| Codex | not used | `codex exec` has no compact command; recorded as `unsupported` |

`npm test` runs `node --test test/*.test.js`, so the bench task repos (which start with failing tests) are not picked up.

## Picker eval

Offline eval of the automatic skill picker (BM25F over skill cards: name x3, description and when_to_use x1, body x0.3 capped at 3000 words, plus tool, file, failure and project signals). No model calls. Run 2026-10-20.

```
node bench/picker/freeze.js            # snapshot this machine's skill catalog (with bodies) into cards.json (home dir becomes ~)
node bench/picker/eval.js              # dev-set metrics only
node bench/picker/eval.js --tune       # grid-search thresholds on the dev set (never touches holdout.json)
node bench/picker/eval.js --holdout    # also print blind held-out metrics
```

Shipped `THRESHOLDS = { hi: 24, lo: 8.5, margin: 1.1 }`. Result (blind held-out, `holdout.json`, 70 cases, one run, never used for tuning):

| set | n | positives | neutral | top1 | hit | falseFire | forbidHits | tokensPerCase | listAllTokens |
|---|---|---|---|---|---|---|---|---|---|
| holdout | 70 | 52 | 18 | 0.365 | 0.385 | 0.167 | 1 | 52 | 5676 |

dev (tuned on, not an estimate of real-world accuracy), `cases.json`, 129 cases:

| set | n | positives | neutral | top1 | hit | falseFire | forbidHits | tokensPerCase | listAllTokens |
|---|---|---|---|---|---|---|---|---|---|
| dev | 129 | 100 | 29 | 0.280 | 0.300 | 0.069 | 0 | 20 | 5676 |

Label audit: `cases.json` was re-audited blind; 10 cases gained 13 acceptable skills and none were removed (log in `picker/label-audit.md`). `holdout.json` was written by a third independent labeler and is only read by `--holdout` and `test/picker-eval.test.js`. Vocabulary (`EXPAND`, `DEP_WORDS`, `MARKERS`) is convention-level only and no longer fitted to cases. `npm test` gates both sets: dev as a regression guard, holdout against floors set from the one blind run (value minus 0.05).
