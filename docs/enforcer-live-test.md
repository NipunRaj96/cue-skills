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

## Clean re-run (A/B with isolation)

**How the arms were isolated:**
- Cue's hooks were installed globally.
- The global rules held only `picker: false`, so the hooks injected nothing in the control arm.
- The Cue arm got `always: [caveman, ponytail]` from a trusted project `.cue/rules.yaml` inside its own worktrees.
- Every session first answered a warm-up turn ("ready").
- Script turn 1 ran before the Cue rules existed, so it is a shared baseline. Cue was active from script turn 2.

**Verified from Cue's log:**
- Control sessions: 0 skill injections.
- Cue sessions: 35 and 26 skill injections, and 9 and 5 drift corrections.

Raw output (transcript turn t1 is the warm-up, t2 is script turn 1, and t3–t13 are the turns with Cue active):

```

ctrl zealous-davinci: turns=13
t1:4tok/1w/0.0%  t2:576tok/195w/10.9%!  t3:550tok/274w/10.3%!  t4:484tok/185w/12.2%!  t5:1081tok/98w/9.4%!  t6:126tok/64w/11.1%  t7:661tok/223w/10.4%!  t8:732tok/365w/9.4%!  t9:1060tok/76w/14.9%!  t10:492tok/246w/12.3%!  t11:669tok/335w/9.5%!  t12:866tok/396w/13.1%!  t13:826tok/325w/9.7%!
total out tokens 8127, drifted turns 11/13

ctrl frosty-heisenberg: turns=13
t1:4tok/1w/0.0%  t2:513tok/173w/13.1%!  t3:468tok/227w/10.5%!  t4:309tok/144w/12.9%!  t5:1232tok/67w/8.1%!  t6:148tok/73w/10.0%  t7:620tok/213w/12.0%!  t8:691tok/332w/9.4%!  t9:1323tok/91w/10.1%!  t10:596tok/278w/11.6%!  t11:604tok/304w/8.7%!  t12:752tok/335w/11.6%!  t13:739tok/282w/5.9%
total out tokens 7999, drifted turns 10/13

cue frosty-euler: turns=13
t1:4tok/1w/0.0%  t2:499tok/164w/7.8%!  t3:529tok/213w/5.7%!  t4:426tok/125w/10.5%!  t5:1180tok/69w/3.9%  t6:198tok/68w/12.5%!  t7:732tok/166w/4.0%!  t8:1192tok/298w/6.6%!  t9:1105tok/61w/13.2%!  t10:1048tok/225w/5.3%!  t11:739tok/352w/7.3%!  t12:1131tok/315w/6.9%!  t13:829tok/332w/5.9%!
total out tokens 9612, drifted turns 11/13

cue sad-herschel: turns=13
t1:4tok/1w/0.0%  t2:462tok/156w/12.4%!  t3:478tok/196w/3.5%  t4:246tok/101w/2.2%  t5:1042tok/49w/10.2%!  t6:154tok/55w/0.0%  t7:381tok/151w/6.9%!  t8:721tok/309w/2.8%  t9:1082tok/64w/12.3%!  t10:965tok/238w/10.8%!  t11:519tok/233w/5.5%!  t12:650tok/240w/1.7%  t13:912tok/343w/0.0%
total out tokens 7616, drifted turns 6/13
```

**Over the Cue-active turns (t3–t13):**

| Arm | Avg filler ratio | Prose words | Output tokens |
|---|---|---|---|
| Control 1 | 11.1% | 2,587 | 7,547 |
| Control 2 | 10.1% | 2,346 | 7,482 |
| Cue 1 | 7.4% | 2,224 | 9,109 |
| Cue 2 | 5.1% | 1,979 | 7,150 |
| **Control mean** | **10.6%** | **2,467** | **7,515** |
| **Cue mean** | **6.3%** | **2,102** | **8,130** |

**Result:**
- The enforcer cuts filler words by about 40% and prose words by about 15%.
- It does **not** reduce output tokens. They are about 8% higher in the Cue arm, which is within the noise of two sessions.
- Most of the output is code, tool calls and content that the prompts demand. Trimming style per turn trims words, not total output.
- **The enforcer does not deliver the "token usage drops a lot" goal.**
