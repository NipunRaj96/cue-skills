import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, readdirSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/engine.js";
import { renderFull, reminder } from "../src/render.js";
import { loadState, saveState } from "../src/state.js";
import { readLog } from "../src/log.js";

function fixture({ rules = "always: [caveman]\nwhen:\n  - prompt: [ui]\n    use: [frontend-design]\n" } = {}) {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "cue-")));
  process.env.HOME = h;
  delete process.env.CUE_DISABLE;
  const cwd = join(h, "proj");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  const mk = (name, body = "body of " + name) => {
    const d = join(h, ".claude/skills", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "SKILL.md"), `---\nname: ${name}\ndescription: desc of ${name}\n---\n${body}\n`);
    return join(d, "SKILL.md");
  };
  mk("caveman"); mk("frontend-design");
  mkdirSync(join(h, ".cue"), { recursive: true });
  writeFileSync(join(h, ".cue/rules.yaml"), rules);
  return { h, cwd, mk };
}

test("start injects full once, prompt then only reminds", () => {
  const { cwd } = fixture();
  const a = run({ agent: "t", session: "s1", phase: "start", cwd });
  assert.match(a.text, /## Skill: caveman\nSkill dir: /);
  assert.match(a.text, /Active skills: caveman \(/);
  assert.doesNotMatch(a.text, /^---$/m);
  const b = run({ agent: "t", session: "s1", phase: "prompt", prompt: "hi", cwd });
  assert.doesNotMatch(b.text, /## Skill:/);
  assert.match(b.text, /^Active skills:/m);
});

test("reset re-injects after compaction", () => {
  const { cwd } = fixture();
  run({ agent: "t", session: "s2", phase: "start", cwd });
  assert.match(run({ agent: "t", session: "s2", phase: "start", reset: true, cwd }).text, /## Skill: caveman/);
});

test("prompt rule activates new skill mid-session", () => {
  const { cwd } = fixture();
  run({ agent: "t", session: "s3", phase: "start", cwd });
  const r = run({ agent: "t", session: "s3", phase: "prompt", prompt: "fix the ui", cwd });
  assert.match(r.text, /## Skill: frontend-design/);
  assert.doesNotMatch(r.text, /## Skill: caveman/);
  assert.match(r.text, /\n\nActive skills: caveman \(.*\), frontend-design \(/);
  assert.deepEqual(r.skills.map((s) => s.name), ["caveman", "frontend-design"]);
});

test("tool phase: new skills only, no reminder", () => {
  const { cwd } = fixture();
  run({ agent: "t", session: "s4", phase: "start", cwd });
  assert.equal(run({ agent: "t", session: "s4", phase: "tool", cwd }).text, "");
});

test("budget overflow becomes Read line", () => {
  const { cwd, mk } = fixture();
  const p = mk("big", "x".repeat(9001));
  const out = renderFull([{ name: "big", path: p }]);
  assert.match(out, new RegExp(`## Skill: big\\nRead ${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} and follow it\\.\\n`));
  assert.ok(out.length < 200);
  // engine path: big skill is marked injected after its Read line
  writeFileSync(join(process.env.HOME, ".cue/rules.yaml"), "always: [big]\n");
  const a = run({ agent: "t", session: "s5", phase: "start", cwd });
  assert.match(a.text, /Read .* and follow it\./);
  assert.doesNotMatch(run({ agent: "t", session: "s5", phase: "prompt", cwd }).text, /## Skill:/);
});

test("unreadable body falls back to Read line", () => {
  assert.match(renderFull([{ name: "gone", path: "/nope/SKILL.md" }]), /Read \/nope\/SKILL\.md and follow it\./);
});

test("reminder format and truncation", () => {
  assert.equal(reminder([]), "");
  assert.equal(reminder([{ name: "a", description: "x" }, { name: "b", description: "y".repeat(100) }]),
    `Active skills: a (x), b (${"y".repeat(80)}).`);
});

test("engine never throws; logs error", () => {
  const { h, cwd } = fixture();
  mkdirSync(join(h, ".cue/catalog.json")); // dir where cache file goes: write fails
  const r = run({ agent: "t", session: "s6", phase: "start", cwd });
  assert.deepEqual(r, { text: "", skills: [] });
  assert.ok(readLog(1)[0].error);
});

test("system phase is stateless", () => {
  const { cwd } = fixture();
  for (let i = 0; i < 2; i++) {
    const r = run({ agent: "t", session: "s7", phase: "system", cwd });
    assert.match(r.text, /## Skill: caveman/);
    assert.doesNotMatch(r.text, /Active skills:/);
  }
});

test("CUE_DISABLE=1 returns empty", () => {
  const { cwd } = fixture();
  process.env.CUE_DISABLE = "1";
  assert.deepEqual(run({ agent: "t", session: "s8", phase: "start", cwd }), { text: "", skills: [] });
  delete process.env.CUE_DISABLE;
});

test("state: sanitised id, atomic, prunes old files", () => {
  const { h } = fixture();
  const dir = join(h, ".cue/state");
  mkdirSync(dir, { recursive: true });
  const old = join(dir, "x-old.json");
  writeFileSync(old, "[]");
  const t = new Date(Date.now() - 8 * 864e5);
  utimesSync(old, t, t);
  saveState("a", "../../evil id", new Set(["k"]));
  assert.ok(existsSync(join(dir, "a-______evil_id.json")) || readdirSync(dir).some((f) => f.startsWith("a-") && !f.includes("/")));
  assert.ok(!existsSync(old));
  assert.ok(readdirSync(dir).every((f) => !f.includes(".tmp")));
  assert.deepEqual([...loadState("a", "../../evil id")], ["k"]);
});

test("log lines have ISO ts", () => {
  const { cwd } = fixture();
  run({ agent: "t", session: "s9", phase: "start", cwd });
  const l = readLog(1)[0];
  assert.equal(l.event, "start");
  assert.ok(!isNaN(Date.parse(l.ts)));
});
