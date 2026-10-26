# cue-skills

> **Status: archived experiment.** Cue works as software but did not solve the problem it was built for. This README explains the idea, what was built, how it was tested, and why it failed, so others can skip the dead ends.

## The idea

Developers who use coding agents (Claude Code, Codex, Antigravity, OpenCode, OpenClaw and others) collect skills from GitHub: caveman, ponytail, superpowers, graphify, frontend-design and hundreds more. In practice these skills rarely get used when they should:

1. **You forget** to invoke them.
2. **You don't know** which of 100+ installed skills fits the task.
3. **The agent chooses poorly.** It is supposed to pick skills from their descriptions, but often doesn't.
4. **The agent drifts.** A skill that is followed at turn 1 is ignored by turn 10.

Cue's goal was to make the agent use the right skill at the right moment, with no human intervention, and to cut token usage while doing it.

## What was built

| Version | What it does |
|---|---|
| **v0.1** ([npm](https://www.npmjs.com/package/cue-skills)) | A rules engine (`always`, `never`, and `when` on prompt words, files and project markers). It injects skill text through each agent's hooks or plugins, with adapters for 7 agents. It re-injects after compaction and adds a per-prompt reminder. |
| **v0.1 hardening** | An independent security audit found 1 critical and 3 high issues: repo-controlled symlinks, auto-trusted project rules, and skill-name hijacking. All of them were fixed. Project rules now need `cue-skills trust`, and all project files go through one safe reader. |
| **v0.2** (this branch) | Claude Code only. It adds two parts:<br>• **Picker:** BM25 over skill cards plus bodies. It reads signals from prompts, tool calls (including MCP), files, test failures and project dependencies. When unsure, it injects a top-3 shortlist.<br>• **Drift enforcer:** a Stop hook scores each reply against standing skills (for example caveman's filler-word ratio) and re-injects the skill on the next turn when the reply drifts. |

There are 202 tests. Every hook fails open (an error means no injection, never a blocked agent), and Cue makes no network calls.

## How it was tested

Everything below is in [`docs/`](docs). The raw harnesses are in [`bench/`](bench).

| Experiment | Result |
|---|---|
| **Native baseline**: 10 realistic tasks in Claude Code with 99 skills installed and no Cue ([native-baseline.md](docs/native-baseline.md)) | A fitting skill was used in **1 of 10** sessions. The problem is real. |
| **Same 10 tasks with Cue's picker live** | **3 of 10**, of which at most 2 are attributable to Cue. In 3 sessions the right skill was on Cue's shortlist and the agent ignored it. |
| **Offline picker eval**: 129 dev cases plus a 70-case blind holdout ([bench/picker](bench/picker)) | Ranking is decent: the right skill is in the top 3 for about 70% of cases. Deciding *when* to fire is hard: hit@shortlist was 0.64 with a 33% false-fire rate. Local embeddings (nomic-embed-text) added only 2–4 points, which is not worth the dependency. |
| **Drift enforcer, clean A/B**: 4 Claude Code sessions, 12-turn script, Cue vs control ([enforcer-live-test.md](docs/enforcer-live-test.md)) | Filler words dropped about **40%** and prose words about **15%**, but **output tokens did not drop**. They rose about 8%, within noise. |
| **Early token benchmark (v0.1)**: 5 agents, caveman and ponytail always on | About −80% output tokens on Claude Code. But this measured caveman itself, which its own plugin already delivers. Cue added nothing on top. |

## Why it failed

1. **Injected context is a hint, not an instruction.** Hooks can only add text next to the user's prompt. Models weigh that text far below the task itself.
   - Shortlists were ignored.
   - Drift corrections were followed for a turn, then lost.
   - The one thing that worked was loading a skill's full content as the main instruction (one picker case, and caveman at session start).
2. **Style is not size.** Making replies terse removes filler words, but the content the prompt demands (code, explanations, tool calls) stays. Output tokens did not move.
3. **Cue adds tokens.** Every injected body and reminder is input. A tool whose goal is saving tokens must save more than it injects, and Cue didn't.
4. **The always-on half already exists.** Skills like caveman and ponytail ship their own hooks. Routing on top of them added cost, not value.
5. **We validated too late.** Seven agent adapters and a full security hardening were built before the core hypothesis ("injection changes behaviour") was tested. Testing it first would have taken a day.

## Lessons for anyone building in this space

- **Measure the native baseline first.** It took one afternoon and changed the whole direction.
- **Isolate A/B arms properly.** Claude Code reloads global hooks live, which contaminated our first A/B. Newly created project-level `settings.local.json` files are *not* hot-loaded. Gate behaviour per arm with project rules instead.
- **Keep eval sets honest.** Write labels independently of the code. Use a blind holdout and look at it once. Our first "63% accuracy" came from vocabulary fitted to the dev cases; the honest number was 38%.
- **Put persistent behaviour where it has authority.** That means the system prompt (Claude Code output styles), not per-turn hints.
- **Most tokens in coding sessions are input** (file reads, tool output, history). Input compression is probably a bigger lever than output style; see projects like headroom.

## What might work instead (untested)

- **Skills as output styles.** Generate a Claude Code output style from your standing skills, so they live in the system prompt and survive compaction at near-zero cost. This is the one cheap experiment we didn't run.
- **Skills as subagents.** Turn a situational skill into a `.claude/agents/<skill>.md` agent, so the skill *is* the agent's system prompt rather than a hint.
- **LLM routing.** Use a `type: "prompt"` hook with a small, fast model to decide which skill applies, instead of keyword matching.
- **An API-level proxy.** Place skills in the real system block and compress tool output, for any agent.

## Repository map

| Path | Contents |
|---|---|
| `src/` | Engine: catalog, rules, picker (`bm25`, `signals`, `pick`), enforcer (`enforce`, `observe`), safe file reads, trust. |
| `src/adapters/`, `plugins/` | Adapters for Claude Code, Codex, Gemini CLI, Antigravity, Cursor, OpenCode and OpenClaw. |
| `bench/` | Token benchmark, drift suite, picker eval (cases, holdout, label audit, embedding spike). |
| `docs/` | Experiment write-ups, plus designs and plans under `docs/superpowers/`. |
| `test/` | `node --test test/*.test.js` |

## If you still want to try it

```sh
npm i -g cue-skills && cue-skills init     # installs hooks into detected agents
cue-skills status                          # what's active and why
cue-skills uninstall && npm rm -g cue-skills
```

Rules live in `~/.cue/rules.yaml`. A project's `.cue/rules.yaml` is ignored until you run `cue-skills trust` in that project. Config edits keep a `.bak` copy of the original file, and that copy can contain secrets from the original, so delete it yourself after uninstalling.

## Credits

Created by Nipun Kumar.

## License

Copyright (c) 2026 Nipun Kumar. All rights reserved.

This repository is published for reading and reference only. No license is granted to use, copy, modify, or distribute the code or the design without the author's written permission.
