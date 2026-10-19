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
