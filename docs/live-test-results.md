# Live test results: v0.1.0

**Date:** 2026-10-19
**Machine:** macOS, Node 23.10

## How the test works

A canary skill tells the model to end every reply with the word PINEAPPLE. It lives at `~/cue-canary/canary/SKILL.md`.

The rules file `~/.cue/rules.yaml` makes the canary always active:

```yaml
always: [canary]
skillDirs: [~/cue-canary]
```

Adapters were installed with `cue-skills init --only <id>`.

**Pass condition:** the model's reply ends with PINEAPPLE, and `~/.cue/log.jsonl` shows the injection.

## Results

| Surface | Version | Model | Result | Notes |
|---|---|---|---|---|
| OpenCode | 1.14.29 | ollama/gemma4:31b-cloud | pass | `experimental.chat.system.transform` injects the skill on every call. The model was set in a project-local `opencode.json`, because the models in the global config were retired upstream. |
| OpenClaw | 2026.4.26 | ollama/gemma4:31b-cloud | pass | Tested with `openclaw agent --local --agent main`, through the `before_prompt_build` hook. Re-installing works, because install passes `--force`. |
| Antigravity CLI (`agy`) | 1.4.2 | default | pass | See the Antigravity detail below. |
| Claude Code CLI | 2.1.143 | ollama/gemma4:31b-cloud via `ollama launch claude` | pass | Run on 2026-10-19 with the SessionStart and UserPromptSubmit hooks passed through `--settings`. The reply ended in PINEAPPLE. |

**Antigravity detail:**
- SessionStart sends the full skill body as a persistent `systemMessage`.
- PreInvocation sends only the reminder, as an `ephemeralMessage`.
- A follow-up turn (`agy -c`) still ended in PINEAPPLE, so the skill survives past turn 1.
- One headless run asked for a `read_file` permission that print mode cannot grant. Three re-runs were clean.

## Not live-tested

These adapters are built from each agent's docs and marked experimental:

- Codex: the local install is broken, with its binary missing.
- Gemini CLI: not installed.
- Cursor: not installed.
- Antigravity App and IDE: they share the CLI's hooks file, so a by-hand check in the App is enough.

## How to re-run the Claude Code test

1. Run `claude /login`.
2. Then run, from any directory:

```sh
claude -p "say hi" --settings <file with SessionStart and UserPromptSubmit hooks pointing at: node bin/cue-skills.js hook claude <Event>>
```

Alternatively, run `cue-skills init --only claude` and then `claude -p "say hi"`.
