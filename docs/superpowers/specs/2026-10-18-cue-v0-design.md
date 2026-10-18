# Cue v0 design

## Intent

Coding agents fail to use installed skills for four reasons:

- The user forgets to invoke them.
- The user doesn't know which skill fits.
- The agent picks badly once hundreds of skills are installed.
- The agent drifts away from a loaded skill mid-session, especially after context compaction.

Cue moves skill choice out of the agent's judgment. The user's rules decide which skills are active. Hooks or plugins in each agent inject those skills automatically and re-inject them so they survive drift and compaction.

## Goals for v0

- **Rules layer:** `always`, `never` and `when` rules, with a global file and a per-project file.
- **Catalog:** scan every known skill directory and resolve skill names to `SKILL.md` files.
- **Forced injection** into Claude Code, OpenCode, OpenClaw and the Antigravity CLI, which can all be tested locally. Codex, Gemini CLI, Antigravity and Cursor adapters are built from their docs and marked experimental.
- **Drift handling:**
  - Full skill body at session start, after compaction, and when a skill first becomes active.
  - A short factual reminder on every prompt.
- **Visibility:** `cue-skills why` shows recent injections and the reason for each.
- **Fallback for agents without hooks:** `cue-skills sync` writes a marked block into `AGENTS.md`.
- **Install:** one command, `npx cue-skills init`. It detects the agents present and installs their adapters.

## Non-goals for v0

These are deferred to later versions:

- Picking skills by meaning (embeddings)
- A token-savings counter and benchmarks
- A safety scan of skills
- An MCP server
- A drift compliance checker that measures whether output still follows a skill
- Moment triggers other than compaction and file touch

## Anti-goals

These count as failure even if everything else works:

- **A hook that breaks or slows the agent.** Hooks fail open: on any error they exit 0 with no output and log the error. The latency budget is under 100 ms.
- **Corrupting a user's agent config.** Every config edit makes a `.bak` backup first, is idempotent, and can be removed by `uninstall`.
- **Network calls or telemetry.** Everything stays local.

## Constraints

- **Runtime:** Node 18 or later, ESM, plain JS. The only runtime dependency is `yaml`. Tests use `node:test`.
- **Hook entry:** `init` writes absolute paths (`process.execPath` plus the installed bin), never `npx`, because `npx` adds about 500 ms per prompt.
  - If `init` is running from the npx cache (a path containing `_npx`), it prints a warning and tells the user to run `npm i -g cue-skills` first.
- **Claude Code size cap:** `additionalContext` is capped at 10,000 characters. The render budget is 9,000 characters per injection. Bodies that overflow are replaced by `Read <path> and follow it.`
- **Wording:** injected text is factual ("Active skills for this session: …"), not imperative system-speak. Claude Code's docs say imperative wording can trip prompt-injection defences.
- **Author:** Nipun Kumar is the sole author. No AI attribution anywhere.

## Rules file

The global file is `~/.cue/rules.yaml`. The project file is `<project root>/.cue/rules.yaml`. The project root is the nearest ancestor directory containing `.git`, or the cwd if there is none.

```yaml
always: [caveman, ponytail]       # active every session, in priority order
never: [some-skill]               # never injected; wins over everything
when:
  - prompt: [design, ui, landing page]   # case-insensitive word or phrase match on the user prompt
    use: [frontend-design]
  - files: ["**/*.tsx", "**/*.css"]      # glob match on files the agent reads or edits (Claude Code and Codex, PreToolUse)
    use: [frontend-design]
  - project: [next.config.js]            # marker file exists at the project root
    use: [frontend-design]
skillDirs: [~/my-skills]          # extra directories to scan
```

Merge rules:

- The project file's lists append to the global file's lists.
- `never` from either file removes the skill.
- Order is preserved and duplicates are dropped.
- A skill name that doesn't resolve produces a warning in `status` and is otherwise skipped.

## Catalog

**Scan roots.** Each root is scanned recursively up to 6 levels deep for `SKILL.md`.

- Global roots:
  - `~/.claude/skills`
  - `~/.claude/plugins/cache/*/*/<latest version>/skills`
  - `~/.agents/skills`
  - `~/.config/opencode/skills`
  - `~/.openclaw/skills`
  - `~/.gemini/config/skills`
  - `~/.gemini/skills`
  - `~/.cursor/skills`
  - `~/.codex/skills`
- Project roots: `.claude/skills`, `.agents/skills` and `.opencode/skills`.
- Extra roots: the `skillDirs` entries from the rules file.

**Entry fields.** Each entry holds:

- `name` (from frontmatter, or the folder name)
- `plugin` (the plugin folder name, if the skill is in a plugin)
- `description`
- `path`
- `size`

**Name resolution.** `plugin:name` matches exactly. A bare `name` resolves in this order:

1. Project roots
2. User roots
3. Plugin roots

**Cache.** The catalog is cached in `~/.cue/catalog.json`, keyed by the mtimes of the scan roots. It is rebuilt when any root's mtime changes, or when the user runs `cue-skills scan`.

## Selection

`select({ prompt, cwd, files, rules, catalog })` returns `[{ skill, reason }]`. It is deterministic. Reasons look like `always`, `prompt:"design"`, `files:**/*.tsx` or `project:next.config.js`.

## Session state and injection

**State file.** `~/.cue/state/<agent>-<sessionId>.json` records which skills have had their full body injected. Files older than 7 days are pruned on write.

**On each hook call:**

1. Compute the active skills.
2. Render the full body (frontmatter stripped, under a `## Skill: <name>` header) for each active skill whose body hasn't been injected this session.
3. On `SessionStart` with source `compact` or `clear`, reset the state first so every active skill is re-injected.
4. Always append the reminder: `Active skills: caveman (one-line description…), ponytail (…).`
5. Log one JSON line to `~/.cue/log.jsonl`: `{ ts, agent, session, event, skills: [{name, reason}], chars, error? }`.

## Surfaces: CLI versus IDE

An adapter targets a **surface**, meaning one config home, not a brand. Some products share one config home across their CLI and IDE. Others keep separate homes per surface. `init` detects each surface on its own, and `status` lists each surface on its own row.

| Product | Surfaces | Config home | Adapters needed |
|---|---|---|---|
| Claude Code | CLI, desktop Code tab, VS Code and JetBrains extensions | `~/.claude/settings.json`, shared | 1 |
| Codex | CLI, IDE extension, desktop app | `~/.codex/`, shared | 1 |
| OpenCode | TUI/CLI, desktop app | `~/.config/opencode/`, shared | 1 |
| OpenClaw | gateway serving every channel | `~/.openclaw/`, shared | 1 |
| Antigravity | `agy` CLI | `~/.gemini/antigravity-cli/` (`settings.json`, `plugins/`) | separate |
| Antigravity | App and IDE (`Antigravity.app`, `Antigravity IDE.app`) | `~/.gemini/config/` (`hooks.json`, `plugins/`) | separate |
| Gemini CLI | CLI | `~/.gemini/settings.json` | 1 |
| Cursor | IDE, and `cursor-agent` CLI (shared home unverified) | `~/.cursor/` | 1, CLI unverified |

For Antigravity, both surfaces get the same hook command and differ only in where the hook is registered. The builder verifies the CLI hook registration path against `agy` 1.4.2 on this machine.

## Adapters

All adapters call `cue-skills hook <agent> <event>`, passing the agent's JSON on stdin and printing the agent's output format. Install is idempotent. Cue's entries are found by the substring `cue-skills hook`.

| Agent | Status | Registration | Events and output |
|---|---|---|---|
| Claude Code | tested | `~/.claude/settings.json` hooks | `SessionStart` (`startup\|resume\|clear\|compact`) and `UserPromptSubmit` return `{"hookSpecificOutput":{"hookEventName":E,"additionalContext":T}}`. `PreToolUse` (`Read\|Edit\|Write\|MultiEdit`) is used for `files` rules and returns the same shape for newly activated skills only. |
| OpenCode | tested | drop `~/.config/opencode/plugins/cue-skills.js` (no config edit) | `experimental.chat.system.transform` pushes the full bodies of active skills every call, which lands in the cached system prompt and survives compaction. `chat.message` captures the prompt text for prompt rules. The plugin calls the core in-process, not the CLI. |
| OpenClaw | tested | `openclaw plugins install <path to bundled plugin dir>` | `before_prompt_build` returns `{ appendSystemContext: T }`. Verify field behaviour against the local install. |
| Codex CLI | experimental | `~/.codex/hooks.json` | Same events and shape as Claude Code. The user must trust the hooks via `/hooks`, and `init` prints that. |
| Gemini CLI | experimental | `~/.gemini/settings.json` hooks | `SessionStart` and `BeforeAgent` return `{"hookSpecificOutput":{"hookEventName":E,"additionalContext":T}}`. Timeout is in ms. |
| Antigravity CLI (`agy`) | tested | `~/.gemini/antigravity-cli/` hooks (exact file verified at build) | `SessionStart` (full) and `PreInvocation` (reminder) return `{"injectSteps":[{"ephemeralMessage":T}]}`. The prompt text is not available, so prompt rules don't apply. |
| Antigravity App and IDE | experimental, manual check | `~/.gemini/config/hooks.json` | Same as the Antigravity CLI. |
| Cursor | experimental | `~/.cursor/hooks.json` | `sessionStart` returns `{"additional_context":T}`. `sync` also writes `.cursor/rules/cue-skills.mdc` with `alwaysApply: true`. |

## CLI

- `init`: detect installed agents, install their adapters, and create `~/.cue/rules.yaml` from a commented template if it's missing. Prints what it did.
- `uninstall`: remove all adapter entries and restore nothing else.
- `scan`: rebuild the catalog and print counts per root.
- `list`: print the catalog (name, plugin, description truncated).
- `status`: show the merged rules for the cwd, skills that resolve and don't resolve, and installed adapters.
- `why [-n 20]`: print recent log entries.
- `sync`: write the always-skills block into `./AGENTS.md` between `<!-- cue-skills:start -->` and `<!-- cue-skills:end -->`.
- `hook <agent> <event>`: internal entry for adapters.

## PyPI package

`cue-skills` on PyPI is a shim. It runs `npx -y cue-skills@<same version> <args>` if `node` is present, and otherwise prints install instructions.

## Testing

- **Unit tests** (`node:test`) cover rules merge, selection, catalog scan and resolution against a fixture tree, render budget, and adapter output shapes.
- **Live tests** use a canary skill with the instruction "End every reply with the word PINEAPPLE". It runs through Claude Code (`claude -p`), OpenCode (`opencode run` with the local Ollama model), OpenClaw and the Antigravity CLI (`agy -p`). IDE surfaces (Antigravity App and IDE, Claude Code in VS Code) are checked by hand using the same canary. A reply ending in PINEAPPLE proves injection. Each live test also runs after a compaction where the agent allows it.

## Left to the builder

- Internal module layout.
- Glob matching implementation (a small glob-to-regex function is fine).
- Exact template comments in `rules.yaml`.
