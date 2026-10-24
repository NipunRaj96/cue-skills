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
