# Native skill picking: Claude Code baseline

**Date:** 2026-10-25
**Setup:** Claude Code desktop sessions with model `claude-sonnet-5-5` and effort high. The machine has 99 skills installed (77 unique names). Cue was not installed in `~/.claude/settings.json`, so this is Claude Code's own skill picking.

**Method:** 10 realistic tasks, each worded the way a developer would phrase it, never naming a skill. Each task ran once in a fresh session. A skill counts as used if the session called the `Skill` tool or read a `SKILL.md` with Read or Bash.

| Task | Fitting skills installed | Skill used natively |
|---|---|---|
| Landing page for a coffee roastery | frontend-design, design-taste, taste-landing-page, better-design | design-taste |
| Replicate a Stitch screen as a React component | frontend-design, design-taste, better-design | none |
| Fix failing tests (`bench/tasks/retry`) | systematic-debugging, investigate-first, surgical-patch | none |
| Review `src/glob.js` for bugs | code-review, caveman-review, taste-code-review, ponytail-review | none |
| Write a better commit message | caveman-commit | none |
| Create a new skill for SQL migrations | skill-creator, writing-skills | none |
| Typewriter heading animation | animate-text, taste-motion | none |
| Plan a `doctor` command before coding | writing-plans, brainstorming | none |
| Extract API endpoints from an APK | android-reverse-engineering, decompile | none |
| Knowledge graph of `src/` | graphify (also named in the user's CLAUDE.md) | none |

**Result:** 1 of 10 sessions used a fitting skill.

**Caveats:**
- There is one run per task, and only one model was tested.
- The sessions were started from another session, so each received a short neutral background note. The note never mentioned skills.

## Re-run with Cue's picker live (2026-10-25)

**Setup:** the same 10 prompts, model and effort as the baseline. Cue's Claude hooks were installed in the real `~/.claude/settings.json` with no standing skills, so only the picker was active.
- The shortlist-first policy used thresholds `{hi 24, lo 6.25, margin 1.25}`.
- The original settings were restored afterwards.

| Task | Baseline | With Cue | What Cue injected |
|---|---|---|---|
| Landing page | design-taste | none | A design shortlist (taste-code-craft, better-design, frontend-design). The agent ignored it. |
| Stitch → React | none | none | A design shortlist from the `mcp__stitch__*` call. The agent ignored it. |
| Fix failing tests | none | none | A shortlist with systematic-debugging after the Bash failure. The agent ignored it. |
| Review glob.js | none | none | An irrelevant shortlist. |
| Commit message | none | none | An irrelevant shortlist. |
| New SQL skill | none | none | An irrelevant shortlist. |
| Typewriter animation | none | none | An irrelevant shortlist. |
| Plan doctor command | none | writing-plans | An irrelevant shortlist. The hit is not attributable to Cue. |
| APK endpoints | none | android-reverse-engineering (read) | A confident pick: the full skill, as a `Read <path>` card. |
| Knowledge graph | none | graphify | A shortlist that included graphify. |

**Result:** 3 of 10 with Cue, against 1 of 10 without it. At most 2 of the 3 can be attributed to Cue.

**Findings:**
1. **The agent mostly ignores shortlists.** In 3 sessions the correct skill was on the shortlist and went unused. Injecting the skill itself works: the APK session read the skill and followed it.
2. **The shortlists are noisy.** Skills with long, generic bodies (android-reverse-engineering, executing-plans, subagent-driven-development) reach most shortlists. The neutral background note given to the sessions adds more noise words.

**Caveat:** this is one run per task. Read the result as a direction, not a conclusion.
