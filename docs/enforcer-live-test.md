# Drift enforcer: live test in Claude Code desktop

**Date:** 2026-10-25

## Setup
- **Sessions:** 4 Claude Code desktop sessions, model `claude-sonnet-5-5` at medium effort, each in its own worktree.
- **Script:** the same 12-turn script in each, from `bench/drift/cache-session/task.json`. Turns were sent one at a time.
- **Plugins:** the user's caveman and ponytail plugins were active in all four.
- **Intended arms:**
  - Control (2 sessions): plugins only.
  - Cue (2 sessions): plugins plus Cue's enforcer, with `always: [caveman, ponytail]` and `picker: false`.

## The A/B comparison is invalid
Cue's hooks were installed in the global `~/.claude/settings.json` after the control sessions had started.
- Claude Code reloads hooks live, so Cue fired in both control sessions from turn 2 onwards. Cue's log has 22 and 32 events for them.
- Only turn 1 of the control arm is clean.
- **Lesson:** isolate arms with project-level hooks (`.claude/settings.local.json` inside each worktree), never global settings.

## What the data still shows (all 4 sessions effectively had Cue)
- **Measurement:** per-turn output tokens and filler ratio of the final reply, computed with `node bench/drift/score-transcripts.mjs`. A "!" marks a turn the caveman checker flagged as drifted (filler above 4%).

```

ctrl vigorous-blackburn: turns=12
t1:467tok/140w/2.4%  t2:372tok/157w/0.7%  t3:278tok/106w/3.3%  t4:1118tok/60w/0.0%  t5:143tok/64w/0.0%  t6:562tok/179w/8.9%!  t7:600tok/234w/0.5%  t8:1250tok/69w/9.0%!  t9:670tok/201w/4.0%  t10:550tok/228w/1.4%  t11:820tok/309w/5.8%!  t12:801tok/298w/0.0%
total out tokens 7631, drifted turns 3/12

ctrl cool-montalcini: turns=12
t1:573tok/196w/16.2%!  t2:401tok/204w/8.9%!  t3:229tok/92w/4.0%  t4:1315tok/103w/8.2%!  t5:165tok/76w/0.0%  t6:707tok/231w/8.7%!  t7:816tok/361w/5.9%!  t8:1276tok/124w/10.7%!  t9:1160tok/354w/8.9%!  t10:654tok/308w/7.7%!  t11:738tok/325w/10.0%!  t12:870tok/311w/3.8%
total out tokens 8904, drifted turns 9/12

cue quizzical-nightingale: turns=12
t1:491tok/170w/12.3%!  t2:335tok/147w/5.7%!  t3:221tok/90w/2.6%  t4:1458tok/117w/12.1%!  t5:157tok/72w/0.0%  t6:620tok/203w/9.0%!  t7:743tok/341w/7.6%!  t8:1198tok/119w/12.0%!  t9:1029tok/295w/10.9%!  t10:674tok/307w/5.9%!  t11:1009tok/437w/11.3%!  t12:790tok/320w/0.0%
total out tokens 8725, drifted turns 9/12

cue infallible-greider: turns=12
t1:538tok/196w/12.7%!  t2:272tok/119w/0.9%  t3:242tok/97w/2.3%  t4:1118tok/76w/7.5%!  t5:156tok/76w/10.0%  t6:417tok/155w/1.8%  t7:709tok/299w/2.8%  t8:1102tok/77w/16.2%!  t9:921tok/258w/10.4%!  t10:655tok/293w/4.1%!  t11:756tok/340w/10.9%!  t12:844tok/300w/9.7%!
total out tokens 7730, drifted turns 7/12
```

## Findings
1. **Drift is real and recurs.** Even with Cue active, 3 to 9 of 12 turns per session were flagged.
2. **Next-turn correction does not stick.** Turns right after a "re-applied (drift)" correction often drifted again. Explanation-heavy turns (6, 8, 9, 11) drift in almost every session.
3. **The prompt drives reply length more than any injected skill.** Total output was 7.6k–8.9k tokens per 12-turn session.
4. **Caveat:** n is small, and the test needs a clean re-run with project-level isolation before any conclusion about the enforcer's effect.
