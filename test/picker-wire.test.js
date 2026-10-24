import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixture } from "./helpers.js";
import { run } from "../src/engine.js";
import { runHook } from "../src/hook.js";
import { loadSession, saveSession } from "../src/state.js";
import { readLog } from "../src/log.js";
import { readJson, writeJson } from "../src/jsonfile.js";
import { get } from "../src/adapters/index.js";

const T = { hi: 1000, lo: 3, margin: 1.25 }; // shortlist only; a big catalog gives the terms a real idf
const HEADER = "Skills likely relevant to this task (read the SKILL.md of the one that fits before starting):";
const CMD = (id) => `node /x/cue-skills hook ${id}`;

function setup(rules = "always: [caveman]\n", cave = "terse body") {
  const f = fixture();
  const mk = (n, d, body = "body of " + n) => {
    const p = join(f.h, ".claude/skills", n);
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, "SKILL.md"), `---\nname: ${n}\ndescription: ${d}\n---\n${body}\n`);
  };
  mk("caveman", "terse replies", cave);
  mk("frontend-design", "Create distinctive frontend interfaces, UI components and design replicated from a Stitch screen");
  mk("design-taste", "Design taste for ui interfaces and stitch screens");
  mk("better-design", "Build and review ui design, replicate a design screen");
  mk("systematic-debugging", "Use when encountering any bug, test failure or failing tests, debugging");
  for (let i = 0; i < 60; i++) mk("filler" + i, `unrelated skill number ${i} about topic${i}`);
  mkdirSync(join(f.h, ".cue"), { recursive: true });
  writeFileSync(join(f.h, ".cue/rules.yaml"), rules);
  return { ...f, mk };
}
const go = (cwd, a, session = "s") => run({ agent: "claude", session, cwd, auto: true, thresholds: T, ...a });
const hook = (f, event, input, session = "s") => {
  const o = runHook("claude", event, JSON.stringify({ session_id: session, cwd: f.cwd, ...input }));
  return o ? JSON.parse(o) : {};
};
const ctx = (o) => o.hookSpecificOutput?.additionalContext ?? "";

test("a matching prompt gets the shortlist and the visible line; a neutral prompt gets nothing", () => {
  const { cwd } = setup();
  const r = go(cwd, { phase: "prompt", prompt: "build a ui design with frontend components" });
  assert.ok(r.text.includes(HEADER));
  assert.match(r.text, /- frontend-design: .* \(.*frontend-design\/SKILL\.md\)/);
  assert.match(r.notice, /^cue → shortlist: [a-z-]+(, [a-z-]+){0,2} \(prompt\)$/);
  const n = go(cwd, { phase: "prompt", prompt: "thanks, looks good" }, "n");
  assert.ok(!n.text.includes(HEADER));
  assert.equal(n.notice, undefined);
});

test("the shortlist lists at most three cards and logs a pick event", () => {
  const { cwd } = setup();
  const r = go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.ok(r.text.split("\n").filter((l) => l.startsWith("- ")).length <= 3);
  const l = readLog(5).find((x) => x.event === "pick");
  assert.equal(l.label, "prompt");
  assert.equal(l.mode, "shortlist");
  assert.ok(l.picks.length >= 1 && l.picks.length <= 3);
  assert.ok(l.tokens > 0);
});

test("a lone strong winner gets its full body", () => {
  const { cwd, mk } = setup();
  mk("pdf-forms", "fill pdf forms", "PDF-BODY");
  const r = run({ agent: "claude", session: "w", cwd, auto: true, thresholds: { hi: 2, lo: 1, margin: 1.1 }, phase: "prompt", prompt: "fill pdf forms" });
  assert.match(r.text, /## Skill: pdf-forms\nSkill dir: .*\nPDF-BODY/);
  assert.equal(r.notice, "cue → pdf-forms (prompt)");
});

test("mcp__stitch__get_screen PreToolUse gets the design shortlist (real adapter, shipped thresholds)", () => {
  const f = setup();
  hook(f, "SessionStart", { source: "startup" }, "t");
  const o = hook(f, "PreToolUse", { tool_name: "mcp__stitch__get_screen", tool_input: { screen: "x" } }, "t");
  assert.ok(ctx(o).startsWith(HEADER), ctx(o));
  assert.match(ctx(o), /- (frontend-design|better-design|design-taste): /);
  assert.match(o.systemMessage, /^cue → shortlist: .* \(design task\)$/);
  assert.equal(go(f.cwd, { phase: "tool", tool: "mcp__stitch__get_screen" }, "t").text, "", "not repeated");
});

test("PreToolUse on a plain Read of a markdown file picks nothing", () => {
  const { cwd } = setup();
  const r = go(cwd, { phase: "tool", tool: "Read", files: [join(cwd, "NOTES.md")] });
  assert.equal(r.notice, undefined);
  assert.ok(!r.text.includes(HEADER));
});

test("Bash failure triggers a debugging pick; a passing call does not (adapter map)", async () => {
  const { MAP } = await import("../src/adapters/claude.js");
  assert.equal(MAP.PostToolUse({ tool_input: { command: "npm test" }, tool_response: { stdout: "5 passed" } }), null);
  assert.equal(MAP.PostToolUse({ tool_input: { command: "ls" }, tool_response: { stdout: "1 failed" } }), null);
  assert.equal(MAP.PostToolUse({ tool_input: { command: "npm test" }, tool_response: { stdout: "0 failed, 5 passed" } }), null);
  const bad = MAP.PostToolUseFailure({ tool_input: { command: "npm test" }, error: "Exit code 1\n2 failed" });
  assert.deepEqual([bad.phase, bad.tool, bad.failure, bad.auto], ["tool", "Bash", true, true]);
  assert.equal(MAP.PostToolUse({ tool_input: { command: "npm test" }, tool_response: { stdout: "2 failing" } }).failure, true);
  const { cwd } = setup();
  const r = go(cwd, bad);
  assert.match(r.text, /- systematic-debugging: /);
  assert.match(r.notice, /^cue → shortlist: .*systematic-debugging.* \(test failure\)$/);
});

test("Bash hooks: failure injects, success is silent (through runHook)", () => {
  const f = setup();
  assert.deepEqual(hook(f, "PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: { stdout: "5 passed", stderr: "" } }), {});
  assert.deepEqual(hook(f, "PostToolUseFailure", { tool_name: "Bash", tool_input: { command: "ls" }, error: "Exit code 1" }), {});
});

test("an already shortlisted skill is not repeated; compact lets it return", () => {
  const { cwd } = setup();
  const a = go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.ok(a.text.includes(HEADER));
  assert.ok(loadSession("claude", "s").picks.includes("frontend-design"));
  const b = go(cwd, { phase: "prompt", prompt: "design ui screen interfaces again" });
  assert.ok(!/- frontend-design: /.test(b.text));
  go(cwd, { phase: "start", reset: true });
  assert.deepEqual(loadSession("claude", "s").picks, []);
  assert.match(go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" }).text, /- frontend-design: /);
});

test("standing skills are never picked", () => {
  const { cwd } = setup();
  const r = go(cwd, { phase: "prompt", prompt: "terse replies please" });
  assert.ok(!/- caveman: /.test(r.text));
});

test("the 2000-token cap is shared with an enforcer drift body", () => {
  const big = setup("always: [caveman]\n", "C".repeat(6800)); // about 1700 tokens
  saveSession("claude", "s", { ...loadSession("claude", "s"), drift: { caveman: "filler" } });
  let r = go(big.cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.match(r.text, /CCCC/);
  assert.ok(r.text.includes(HEADER), "300 tokens are left for a shortlist");
  assert.ok(Math.ceil(r.text.length / 4) <= 2000);
  assert.match(r.notice, /^cue → caveman re-applied \(drift\); shortlist: .* \(prompt\)$/);

  const huge = setup("always: [caveman]\n", "C".repeat(7700)); // about 1930 tokens
  saveSession("claude", "s", { ...loadSession("claude", "s"), drift: { caveman: "filler" } });
  r = go(huge.cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.match(r.text, /CCCC/);
  assert.ok(!r.text.includes(HEADER), "nothing is left for the picker");
  assert.ok(Math.ceil(r.text.length / 4) <= 2000);
});

test("the cap holds across the events of one turn", () => {
  const { cwd, mk } = setup();
  mk("frontend-design", "frontend ui design interfaces", "x".repeat(5000));
  mk("systematic-debugging", "bug test failure failing tests debugging", "y".repeat(5000));
  const wide = { hi: 1, lo: 0.1, margin: 1.01 };
  const a = run({ agent: "claude", session: "c", cwd, auto: true, thresholds: wide, phase: "prompt", prompt: "frontend ui design interfaces" });
  assert.match(a.text, /## Skill: frontend-design\nSkill dir:|## Skill: frontend-design\nRead /);
  const b = run({ agent: "claude", session: "c", cwd, auto: true, thresholds: wide, phase: "tool", tool: "Bash", failure: true });
  assert.ok(!/y{50}/.test(b.text), "no body past the shared cap");
  assert.ok(loadSession("claude", "c").turnTokens <= 2000);
});

test("rules.picker: false turns the picker off", () => {
  const { cwd } = setup("always: [caveman]\npicker: false\n");
  const r = go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.ok(!r.text.includes(HEADER));
  assert.equal(r.notice, undefined);
  assert.ok(!go(cwd, { phase: "tool", tool: "mcp__stitch__get_screen" }).text.includes(HEADER));
  assert.ok(!go(cwd, { phase: "tool", tool: "Bash", failure: true }).text.includes(HEADER));
  assert.equal(readLog(10).filter((l) => l.event === "pick").length, 0);
});

test("rules.never blocks a skill from the shortlist", () => {
  const { cwd } = setup("always: [caveman]\nnever: [frontend-design]\n");
  const r = go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  assert.ok(r.text.includes(HEADER));
  assert.ok(!/- frontend-design: /.test(r.text));
});

test("the project summary rides the first prompt only", () => {
  const { cwd } = setup();
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "1", tailwindcss: "1" } }));
  const chit = go(cwd, { phase: "prompt", prompt: "ok" }); // low lo on purpose: the project words alone fire here
  assert.ok(chit.text.includes(HEADER));
  assert.equal(loadSession("claude", "s").projectSent, true);
  saveSession("claude", "s", { ...loadSession("claude", "s"), picks: [] });
  assert.ok(!go(cwd, { phase: "prompt", prompt: "ok" }).text.includes(HEADER), "no project summary on the second prompt");
});

test("chit-chat in a React project does not fire at the shipped thresholds", () => {
  const { cwd } = setup();
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "1", tailwindcss: "1" } }));
  const r = run({ agent: "claude", session: "r", cwd, auto: true, phase: "prompt", prompt: "thanks, looks good" });
  assert.ok(!r.text.includes(HEADER));
});

test("non-auto agents never pick", () => {
  const { cwd } = setup();
  const r = run({ agent: "codex", session: "c", cwd, phase: "prompt", prompt: "design ui screen interfaces", thresholds: T });
  assert.ok(!r.text.includes(HEADER));
});

test("adapter: new hooks install, are idempotent, keep foreign hooks, uninstall cleanly", () => {
  const { h } = setup();
  const f = join(h, ".claude/settings.json");
  mkdirSync(join(h, ".claude"), { recursive: true });
  writeJson(f, { hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }] } });
  const claude = get("claude");
  claude.install(CMD("claude")); claude.install(CMD("claude"));
  const s = readJson(f);
  const ours = (ev) => (s.hooks[ev] || []).filter((g) => g.hooks.some((x) => x.command.includes("cue-skills hook")));
  assert.equal(ours("PreToolUse").length, 1);
  assert.equal(ours("PreToolUse")[0].matcher, "Read|Edit|Write|MultiEdit|mcp__.*");
  assert.equal(ours("PostToolUse").length, 1);
  assert.equal(ours("PostToolUse")[0].matcher, "Bash");
  assert.equal(ours("PostToolUseFailure").length, 1);
  assert.equal(ours("PostToolUseFailure")[0].matcher, "Bash");
  assert.ok(s.hooks.PostToolUse.some((g) => g.hooks.some((x) => x.command === "echo mine")));
  claude.uninstall();
  const t = readJson(f);
  assert.deepEqual(t.hooks.PostToolUse, [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }]);
  assert.equal(t.hooks.PostToolUseFailure, undefined);
  assert.equal(t.hooks.PreToolUse, undefined);
});

test("install upgrades a v0.1 PreToolUse matcher in place; a shared foreign group is not hijacked", () => {
  const { h } = setup();
  const f = join(h, ".claude/settings.json");
  mkdirSync(join(h, ".claude"), { recursive: true });
  writeJson(f, { hooks: { PreToolUse: [{ matcher: "Read|Edit|Write|MultiEdit", hooks: [{ type: "command", command: CMD("claude") + " PreToolUse", timeout: 5 }] }] } });
  get("claude").install(CMD("claude")); get("claude").install(CMD("claude"));
  let g = readJson(f).hooks.PreToolUse;
  assert.equal(g.length, 1);
  assert.equal(g[0].matcher, "Read|Edit|Write|MultiEdit|mcp__.*");

  writeJson(f, { hooks: { PreToolUse: [{ matcher: "Read|Edit|Write|MultiEdit", hooks: [{ type: "command", command: "echo foreign" }, { type: "command", command: CMD("claude") + " PreToolUse", timeout: 5 }] }] } });
  get("claude").install(CMD("claude"));
  g = readJson(f).hooks.PreToolUse;
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { matcher: "Read|Edit|Write|MultiEdit", hooks: [{ type: "command", command: "echo foreign" }] });
  assert.equal(g[1].matcher, "Read|Edit|Write|MultiEdit|mcp__.*");
});

test("cue-skills why shows a pick line", () => {
  const { h, cwd } = setup();
  go(cwd, { phase: "prompt", prompt: "design ui screen interfaces" });
  const bin = fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url));
  const out = spawnSync(process.execPath, [bin, "why", "-n", "5"], { env: { ...process.env, HOME: h }, encoding: "utf8" }).stdout;
  assert.match(out, / claude pick .*frontend-design.* \[shortlist, prompt, \d+ tokens\]/);
});
