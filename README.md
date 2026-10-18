# cue-skills

**Right skill, right moment.**

Developers collect skills from GitHub (caveman, ponytail, superpowers, frontend-design and hundreds more), but they rarely get used when they should:

1. **You forget** to invoke them.
2. **You don't know** which of 200 installed skills fits the task.
3. **The agent chooses poorly** once hundreds of skill descriptions crowd its context.
4. **The agent forgets too.** Ten turns in, or after a context compaction, it drifts back to its defaults.

Cue takes skill choice out of your memory and the agent's judgment:

- It applies your rules: `always`, `never`, and `when` conditions on prompt words, files and project markers.
- It injects the matching skills automatically through each agent's hooks or plugins.
- It re-injects them after compaction and keeps a one-line reminder on every prompt, to fight drift.
- It shows what it injected and why (`cue-skills why`).

Picking skills by meaning and measuring token savings are planned.

Adapters for Claude Code, Antigravity, OpenCode, OpenClaw, Codex, Gemini CLI and Cursor; see Supported surfaces.

## Install

```sh
npm i -g cue-skills && cue-skills init
```

`init` detects the agents installed on your machine, registers Cue with each, and creates `~/.cue/rules.yaml` from a commented template if the file is missing. It needs Node 18 or later. A PyPI package (`pip install cue-skills`) runs the same CLI through `npx`, but PyPI users must still `npm i -g cue-skills` before running `cue-skills init`, because `init` refuses to run from the npx cache.

## Rules

Rules live in `~/.cue/rules.yaml` (global) and `<project root>/.cue/rules.yaml` (project). Project lists append to global lists, and duplicates are dropped. A project's `.cue/rules.yaml` can inject skill text, with the same trust level as a repo's CLAUDE.md.

```yaml
always: [caveman, ponytail]       # active every session, in priority order
never: [some-skill]               # never injected; wins over everything
when:
  - prompt: [design, ui, landing page]   # case-insensitive word or phrase match on the user prompt
    use: [frontend-design]
  - files: ["**/*.tsx", "**/*.css"]      # glob match on files the agent reads or edits (Claude Code only)
    use: [frontend-design]
  - project: [next.config.js]            # marker file exists at the project root
    use: [frontend-design]
skillDirs: [~/my-skills]          # extra directories to scan
```

Skills are found in the standard skill folders of each agent, in installed Claude Code plugins, and in `skillDirs`. Use `plugin:name` to pick a skill from a specific plugin.

## Supported surfaces

A surface is one config home. Products that share a config home between their CLI and IDE need one adapter. Tested means checked against the real agent; experimental means built from the agent's documentation.

| Product | Surfaces | Status |
|---|---|---|
| Claude Code | CLI, desktop Code tab, VS Code and JetBrains extensions | tested (unit), live pending |
| Antigravity | agy CLI, App and IDE (shared hooks file) | tested (agy CLI); App/IDE experimental |
| OpenCode | TUI/CLI, desktop app | tested |
| OpenClaw | gateway, every channel | tested |
| Codex | CLI, IDE extension, desktop app | experimental |
| Gemini CLI | CLI | experimental |
| Cursor | IDE, `cursor-agent` CLI | experimental |

Codex requires you to trust the new hooks once through `/hooks`. Antigravity does not expose the prompt text, so `prompt` rules do not apply there.

## Commands

- `cue-skills init [--only id,id]`: install into detected agents. Ids: claude, codex, gemini, antigravity, cursor, opencode, openclaw.
- `cue-skills uninstall`: remove Cue from every agent it was installed into.
- `cue-skills scan`: rebuild the skill catalog and print counts per root.
- `cue-skills list`: print the catalog.
- `cue-skills status`: show rule errors, active skills for the current directory, unresolved names, and each agent's state. `stale` marks an OpenCode or OpenClaw plugin whose engine path no longer exists; run `init` again to fix it.
- `cue-skills why [-n N]`: print recent injections from `~/.cue/log.jsonl`.
- `cue-skills sync`: write the always-skills into `./AGENTS.md` (and a Cursor rule when `.cursor` exists).

Set `CUE_DISABLE=1` to turn injection off without uninstalling.

## Uninstall

```sh
cue-skills uninstall && npm rm -g cue-skills
```

Config edits keep a `.bak` copy of the original file. Your own hooks are left untouched.

## Credits

Created by Nipun Kumar.

## License

MIT
