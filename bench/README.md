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

Offline eval of the automatic skill picker (BM25 over skill cards plus tool, file, failure and project signals). No model calls.

```
node bench/picker/freeze.js            # snapshot this machine's skill catalog into cards.json (home dir becomes ~)
node bench/picker/eval.js              # tune and held-out tables under the shipped THRESHOLDS, plus the stitch-to-frontend case
node bench/picker/eval.js --tune       # grid-search thresholds on the tune split first (--tune-only hides the held-out row)
```

`cases.json` holds labeled cases (written independently of the tuning; never edited to fit it). Case `i` is in the tune split if `i % 10 < 7`, else held out. Thresholds and vocabulary (stopwords, stemmer, `EXPAND`, `DEP_WORDS`, `MARKERS`) are tuned on the tune split only; `test/picker-eval.test.js` gates the held-out split against floors set from the first honest run.

Shipped `THRESHOLDS = { hi: 15, lo: 6, margin: 2 }` (2026-10-20):

| split | n | positives | neutral | top1 | hit | falseFire | forbidHits | tokensPerCase | listAllTokens |
|---|---|---|---|---|---|---|---|---|---|
| tune | 91 | 70 | 21 | 0.614 | 0.671 | 0.095 | 0 | 78 | 5676 |
| test | 38 | 30 | 8 | 0.633 | 0.633 | 0.250 | 1 | 86 | 5676 |
