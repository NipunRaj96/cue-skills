# Cue benchmark design

## Intent

Measure whether Cue does three things:
1. Gets skills used.
2. Keeps them in use over a session, against drift.
3. Saves tokens.

It runs across the real agents on this machine. The numbers go in the README and the pitch.

## Questions it answers

1. **Token effect.** Does an always-on token-saving skill (caveman, ponytail) reduce output tokens per turn compared with no skill?
2. **Drift.** When a skill is given once by hand at the start (the "manual" baseline), does compliance decay over turns? Does Cue hold it?
3. **No harm.** Does task success (the task's tests pass) stay the same?

## Agents and how they are invoked

All runs are headless and run in a fresh temp git repo under `/tmp/cue-bench/<run-id>/`. Auto-approve flags are allowed ONLY there.

| Agent | Command (verify exact flags) | Model | Continue the session |
|---|---|---|---|
| Claude Code | `ollama launch claude --model gemma4:31b-cloud -y -- -p <prompt> --settings <cue-settings.json> --output-format json --dangerously-skip-permissions` | gemma4:31b-cloud | `-c` |
| OpenCode | `opencode run -m ollama/gemma4:31b-cloud --format json <prompt>` (the run dir has `opencode.json` registering the model) | gemma4:31b-cloud | `-c` |
| OpenClaw | `openclaw agent --local --agent cue-bench --json -m <prompt>`, with a dedicated `cue-bench` agent whose workspace is the run dir | gemma4:31b-cloud | same agent session; reset between sessions |
| Antigravity | `agy -p <prompt> --model claude-sonnet-4-6 --output-format json --dangerously-skip-permissions --sandbox` | claude-sonnet-4-6 | `-c` |
| Codex | `ollama launch codex --model gemma4:31b-cloud -y -- exec --json --sandbox workspace-write --skip-git-repo-check <prompt>` | gemma4:31b-cloud | `exec resume --last` |

Cue adapters are already installed for OpenCode, OpenClaw and Antigravity. For Claude Code, the harness passes `--settings` with Cue hooks. For Codex, the harness installs Cue's Codex adapter. If Codex's hook trust blocks headless runs, Codex is skipped and the reason is recorded.

## Modes

The harness writes `~/.cue/rules.yaml` for each mode. It backs up the file first and restores it at exit, including on Ctrl-C.

- **none:** empty rules. No skill is mentioned.
- **manual:** empty rules. The first prompt of the session carries the full text of the skills (caveman and ponytail SKILL.md bodies, frontmatter stripped) under the header "Follow these skills for this whole session:". Later turns carry no skill text. This models a user loading a skill once.
- **cue:** `always: [caveman, ponytail]`. Prompts carry no skill text.

## Tasks

5 tasks live in `bench/tasks/<id>/`. Each task has three parts:
- `repo/`: starting files, plus a `node:test` test file.
- `task.json`: `{ "turns": ["prompt 1", ..., "prompt 4"] }`. That is 4 turns: a mix of coding and explanation, where the later turns are follow-ups in the same session.
- A check command, `node --test`, run in the repo after the final turn.

The tasks should exercise both skills:
- **caveman:** explanation-heavy turns, where prose length is measurable.
- **ponytail:** implementation turns, where added lines of code are measurable.

## Metrics, per turn

- `out_tokens`: taken from the agent's JSON usage when available. Otherwise the estimate `ceil(chars/4)`, flagged `estimated: true`.
- `words`: word count of the reply.
- `caveman_score` (0–1): 1 minus the share of reply words that are articles or filler (a, an, the, just, really, basically, actually, simply, sure, certainly, happy). Code blocks are excluded. Higher means more caveman-compliant.
- `loc_added`: from `git diff --numstat` against the previous turn.
- `tests_pass`: final turn only.
- `ms` (duration), `error`.

## Output

- `bench/results/<timestamp>/runs.jsonl`: one line per turn. Fields: `agent`, `mode`, `task`, `repeat`, `turn`, then the metrics.
- `bench/results/<timestamp>/summary.md`: tables for each agent and mode.
  - The mean `out_tokens` and `caveman_score` at turn 1 and at turn 4 (the drift delta).
  - The mean `loc_added`, and the tests pass rate.
  - The token change against `none`, in percent.
- **Resumable:** rerunning with the same results dir skips turns that are already done. That allows a restart after rate limits.

## CLI

```
node bench/run.js [--agents a,b] [--modes none,manual,cue] [--tasks t1,t2] [--repeats N] [--out dir]
```

It runs sequentially, never in parallel, because the rules file is global. Turn timeout is 300 s. After 3 consecutive failures from one agent, that agent is skipped for the rest of the run, and the reason is logged.

## Safety

- Runs happen only under `/tmp/cue-bench`.
- `~/.cue/rules.yaml` is restored at exit.
- The real config of each agent is not modified, apart from what the Cue adapter install already did.
- The harness never pushes, publishes or sends anything.
- `ollama launch codex` may change the Codex profile. The harness records this and runs `ollama launch codex --restore` at the end.

## Not in scope

- Forcing compaction headless. Turn-based drift is the proxy for now.
- Meaning-based picking.
- Statistical significance tests. Report means and n.

## Smoke run first

`--repeats 1 --tasks <2 tasks>` across every agent, to validate the parsers before the full run.
