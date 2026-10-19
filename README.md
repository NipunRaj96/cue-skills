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

Rules live in `~/.cue/rules.yaml` (global) and `<project root>/.cue/rules.yaml` (project). Project lists append to global lists, and duplicates are dropped. A project's `.cue/rules.yaml` can inject skill text, so it is ignored until you run `cue-skills trust` in that project (see [Security and trust](#security-and-trust)).

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
- `cue-skills status`: show the project-rules trust state, rule errors, duplicate skill names, active skills for the current directory, unresolved names, and each agent's state. `stale` marks an OpenCode or OpenClaw plugin whose engine path no longer exists; run `init` again to fix it.
- `cue-skills why [-n N]`: print recent injections from `~/.cue/log.jsonl`.
- `cue-skills sync`: write the always-skills into `./AGENTS.md` (and a Cursor rule when `.cursor` exists). It refuses symlinks and anything outside the project.
- `cue-skills trust [--revoke]`: trust (or stop trusting) the current project's `.cue/rules.yaml`.

Set `CUE_DISABLE=1` to turn injection off without uninstalling.

## Security and trust

Anything a repository controls is untrusted until you opt in.

- Project rules (`<project root>/.cue/rules.yaml`) are ignored until you run `cue-skills trust` in the project. Trust is stored in `~/.cue/trusted.json` as a hash of the file, so any edit revokes it; run `trust` again after reviewing the change. `cue-skills trust --revoke` removes it, and `cue-skills status` shows the state. The file must be a regular file you own, at most 64 KB.
- Project skill folders (`.claude/skills`, `.agents/skills`, `.opencode/skills`) are scanned only in a trusted project. Project `skillDirs` must be relative and stay inside the repo. Symlinks inside the project are never followed, and a `SKILL.md` over 256 KB or that is not a regular file is skipped.
- Project rules cannot override your own: a project skill never replaces a skill named in your global rules, and a project `never` can only remove skills that project added.
- The project root is the nearest `.git` you own, never at or above your home directory.
- `sync` only writes regular files inside the project.
- Hooks fail open: any error means no injection, never a blocked agent.
- Cue makes no network calls.
- `~/.cue` is private to your user (mode 0700; state, log and trust files 0600).

## Uninstall

```sh
cue-skills uninstall && npm rm -g cue-skills
```

Config edits keep a `.bak` copy of the original file. Your own hooks are left untouched. The `.bak` copies hold the original config as it was, including any secrets in it. Cue never deletes them; remove them yourself after uninstalling.

## Credits

Created by Nipun Kumar.

## License

MIT
