import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, symlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixture } from "./helpers.js";
import { runHook } from "../src/hook.js";
import { loadSession } from "../src/state.js";
import { readLog } from "../src/log.js";
import { readJson } from "../src/jsonfile.js";
import { get } from "../src/adapters/index.js";

const VERBOSE = "Sure, I'd be happy to help. Let me just take a look at the file and see what is going on. " +
  "Basically the function is really simple and I'll just make a small change to the loop. " +
  "Of course, the tests should actually pass after the change, and that is great.";
const TERSE = "Bug in loop. Off-by-one. Fixed bound. Tests pass. Run npm test to confirm. Nothing else changed in module.";
const CAVE = "CAVEMAN-BODY " + "c".repeat(6800); // ~1700 tokens
const PONY = "PONYTAIL-BODY " + "p".repeat(6600); // ~1650 tokens

function setup(cavemanBody = CAVE) {
  const f = fixture();
  const mk = (name, body) => {
    mkdirSync(join(f.h, ".claude/skills", name), { recursive: true });
    writeFileSync(join(f.h, ".claude/skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: d ${name}\n---\n${body}\n`);
  };
  mk("caveman", cavemanBody); mk("ponytail", PONY);
  mkdirSync(join(f.h, ".cue"), { recursive: true });
  writeFileSync(join(f.h, ".cue/rules.yaml"), "always: [caveman, ponytail]\n");
  const dir = join(f.h, ".claude/projects/x");
  mkdirSync(dir, { recursive: true });
  return { ...f, dir, tpath: join(dir, "t.jsonl") };
}
const asst = (content) => JSON.stringify({ type: "assistant", message: { role: "assistant", content } });
const text = (t) => ({ type: "text", text: t });
const user = (t) => JSON.stringify({ type: "user", message: { role: "user", content: t } });
const stop = (f, over = {}) =>
  runHook("claude", "Stop", JSON.stringify({ session_id: "s", transcript_path: f.tpath, cwd: f.cwd, stop_hook_active: false, ...over }));
const prompt = (f, p = "hi") => {
  const out = runHook("claude", "UserPromptSubmit", JSON.stringify({ session_id: "s", prompt: p, cwd: f.cwd }));
  return out ? JSON.parse(out) : {};
};
const start = (f, source = "startup") => runHook("claude", "SessionStart", JSON.stringify({ session_id: "s", source, cwd: f.cwd }));
const ctx = (o) => o.hookSpecificOutput?.additionalContext ?? "";

test("Stop: verbose reply sets drift and prints systemMessage, never blocks", () => {
  const f = setup();
  writeFileSync(f.tpath, user("fix it") + "\n" + asst([{ type: "thinking", thinking: "hmm" }, text(VERBOSE)]) + "\n");
  const out = JSON.parse(stop(f));
  assert.match(out.systemMessage, /^cue → caveman drift detected: \d+\.\d% filler words \(\d+\/\d+\); re-applying next turn$/);
  assert.equal(out.decision, undefined);
  assert.match(loadSession("claude", "s").drift.caveman, /filler words/);
  const l = readLog(1)[0];
  assert.equal(l.event, "drift-detected");
});

test("Stop: terse reply, stop_hook_active print nothing", () => {
  const f = setup();
  writeFileSync(f.tpath, asst([text(TERSE)]) + "\n");
  assert.equal(stop(f), "");
  assert.deepEqual(loadSession("claude", "s").drift, {});
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  assert.equal(stop(f, { stop_hook_active: true }), "");
  assert.deepEqual(loadSession("claude", "s").drift, {});
});

test("Stop: thinking and tool blocks are excluded; only the last assistant text counts", () => {
  const f = setup();
  writeFileSync(f.tpath, [
    asst([text(VERBOSE)]),
    asst([{ type: "thinking", thinking: VERBOSE }, { type: "tool_use", name: "Bash", input: { command: VERBOSE } }]),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: VERBOSE }] } }),
    asst([{ type: "thinking", thinking: VERBOSE }, text(TERSE)]),
  ].join("\n") + "\n");
  assert.equal(stop(f), "");
});

test("Stop: a turn with no assistant text does not re-check the previous reply", () => {
  const f = setup();
  writeFileSync(f.tpath, [asst([text(VERBOSE)]), user("next"), asst([{ type: "tool_use", name: "Bash", input: {} }])].join("\n") + "\n");
  assert.equal(stop(f), "");
});

test("Stop: symlinked or out-of-tree transcript is ignored", () => {
  const f = setup();
  const real = join(f.h, ".claude/projects/x/real.jsonl");
  writeFileSync(real, asst([text(VERBOSE)]) + "\n");
  symlinkSync(real, f.tpath);
  assert.equal(stop(f), "");
  const out = join(f.h, "elsewhere.jsonl");
  writeFileSync(out, asst([text(VERBOSE)]) + "\n");
  assert.equal(stop(f, { transcript_path: out }), "");
  assert.deepEqual(loadSession("claude", "s").drift, {});
});

test("Stop: missing, directory and garbage transcripts fail open", () => {
  const f = setup();
  assert.equal(stop(f), "");
  assert.equal(stop(f, { transcript_path: f.dir }), "");
  writeFileSync(f.tpath, "garbage\n{not json\n\u0000\u0001\n");
  assert.equal(stop(f), "");
  assert.equal(stop(f, { transcript_path: undefined }), "");
});

test("Stop: huge transcript is only tail-read", () => {
  const f = setup();
  const filler = user("x".repeat(1000)) + "\n";
  // verbose reply at the very start, then ~1 MB of filler: beyond the 512 KB tail
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  for (let i = 0; i < 1000; i++) appendFileSync(f.tpath, filler);
  assert.equal(stop(f), "");
  // verbose reply at the very end of a 5 MB file is found
  for (let i = 0; i < 4000; i++) appendFileSync(f.tpath, filler);
  appendFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  assert.match(JSON.parse(stop(f)).systemMessage, /drift detected/);
});

test("UserPromptSubmit after drift: correction, full body, flag cleared, systemMessage", () => {
  const f = setup();
  start(f);
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  stop(f);
  const o = prompt(f);
  assert.match(ctx(o), /Previous reply did not follow caveman: \d+\.\d% filler words \(\d+\/\d+\)\. Follow it from now on\./);
  assert.match(ctx(o), /CAVEMAN-BODY/);
  assert.doesNotMatch(ctx(o), /^---$/m);
  assert.equal(o.systemMessage, "cue → caveman re-applied (drift)");
  assert.deepEqual(loadSession("claude", "s").drift, {});
  assert.ok(readLog(5).some((l) => l.event === "drift-corrected"));
  const n = prompt(f);
  assert.doesNotMatch(ctx(n), /CAVEMAN-BODY/);
  assert.equal(n.systemMessage, undefined);
});

test("periodic: ponytail body only on every 10th prompt, under the cap", () => {
  const f = setup();
  start(f);
  for (let i = 1; i <= 9; i++) {
    const o = prompt(f);
    assert.doesNotMatch(ctx(o), /## Skill:/, `prompt ${i}`);
    assert.equal(o.systemMessage, undefined);
  }
  const o = prompt(f);
  assert.match(ctx(o), /PONYTAIL-BODY/);
  assert.doesNotMatch(ctx(o), /CAVEMAN-BODY/); // caveman has a checker
  assert.equal(o.systemMessage, "cue → ponytail re-applied (every 10 turns)");
  assert.doesNotMatch(ctx(prompt(f)), /PONYTAIL-BODY/);
  assert.equal(loadSession("claude", "s").turns, 11);
});

test("cap: second enforcer body past 2000 tokens becomes a Read card", () => {
  const f = setup();
  start(f);
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  for (let i = 1; i <= 9; i++) prompt(f);
  stop(f);
  const o = prompt(f); // prompt 10: caveman drift (full) + ponytail periodic
  assert.match(ctx(o), /CAVEMAN-BODY/);
  assert.doesNotMatch(ctx(o), /PONYTAIL-BODY/);
  assert.match(ctx(o), /## Skill: ponytail\nRead .*ponytail\/SKILL\.md and follow it\./);
  assert.ok(Math.ceil(ctx(o).length / 4) <= 2000);
  assert.equal(o.systemMessage, "cue → caveman re-applied (drift); ponytail re-applied (every 10 turns)");
});

test("compact resets turns but keeps pending drift", () => {
  const f = setup();
  start(f);
  for (let i = 0; i < 3; i++) prompt(f);
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  stop(f);
  start(f, "compact");
  const s = loadSession("claude", "s");
  assert.equal(s.turns, 0);
  assert.match(s.drift.caveman, /filler/);
});

test("adapter: Stop installed with timeout 5, idempotent, foreign kept, uninstall removes", () => {
  const f = setup();
  const settings = join(f.h, ".claude/settings.json");
  mkdirSync(join(f.h, ".claude"), { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }));
  const claude = get("claude");
  claude.install("node /x/cue-skills hook claude"); claude.install("node /x/cue-skills hook claude");
  const stops = readJson(settings).hooks.Stop.flatMap((g) => g.hooks);
  assert.equal(stops.filter((h) => h.command.includes("cue-skills hook")).length, 1);
  assert.equal(stops.find((h) => h.command.includes("cue-skills hook")).timeout, 5);
  assert.ok(stops.some((h) => h.command === "echo mine"));
  claude.uninstall();
  assert.deepEqual(readJson(settings).hooks.Stop, [{ hooks: [{ type: "command", command: "echo mine" }] }]);
});

test("non-auto agents keep v0.1: no counter, no periodic body, no systemMessage", () => {
  const f = setup();
  const run1 = (ev, extra) => runHook("codex", ev, JSON.stringify({ session_id: "c", cwd: f.cwd, ...extra }));
  run1("SessionStart", { source: "startup" });
  for (let i = 0; i < 12; i++) {
    const o = JSON.parse(run1("UserPromptSubmit", { prompt: "hi" }));
    assert.doesNotMatch(o.hookSpecificOutput.additionalContext, /## Skill:/);
    assert.equal(o.systemMessage, undefined);
  }
  assert.equal(loadSession("codex", "c").turns, 0);
});

test("why shows drift events", () => {
  const f = setup();
  writeFileSync(f.tpath, asst([text(VERBOSE)]) + "\n");
  stop(f);
  start(f);
  prompt(f);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url)), "why"], { env: { ...process.env, HOME: f.h }, encoding: "utf8" });
  assert.match(r.stdout, /claude drift-detected caveman:\d+\.\d% filler words/);
  assert.match(r.stdout, /claude drift-corrected caveman:/);
});
