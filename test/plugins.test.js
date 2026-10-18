import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { get } from "../src/adapters/index.js";

function fixture() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "cue-")));
  process.env.HOME = h;
  delete process.env.CUE_DISABLE;
  const cwd = join(h, "proj");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  mkdirSync(join(h, ".claude/skills/frontend-design"), { recursive: true });
  writeFileSync(join(h, ".claude/skills/frontend-design/SKILL.md"), "---\nname: frontend-design\ndescription: ui\n---\nbody\n");
  mkdirSync(join(h, ".cue"), { recursive: true });
  writeFileSync(join(h, ".cue/rules.yaml"), "always: [frontend-design]\n");
  return { h, cwd };
}

test("opencode plugin pushes system text and captures prompt", async () => {
  const { h, cwd } = fixture();
  get("opencode").install();
  const f = join(h, ".config/opencode/plugins/cue-skills.js");
  assert.ok(!readFileSync(f, "utf8").includes("__CUE_ENGINE__"));
  const hooks = await (await import(pathToFileURL(f).href + "?t=1")).CueSkills({ directory: cwd });
  await hooks["chat.message"]({ sessionID: "s" }, { parts: [{ type: "text", text: "fix the ui" }] });
  const out = { system: [] };
  await hooks["experimental.chat.system.transform"]({ sessionID: "s" }, out);
  assert.match(out.system.join("\n"), /## Skill: frontend-design/);
  await hooks["experimental.chat.system.transform"]({}, { system: [] }); // no sessionID: no throw
});

test("opencode uninstall removes file", () => {
  fixture();
  const a = get("opencode");
  a.install();
  assert.ok(a.isInstalled());
  a.uninstall();
  assert.ok(!a.isInstalled());
  assert.equal(a.handle("x", {}), "");
});

test("openclaw install copies plugin, execs CLI; plugin returns appendSystemContext", async () => {
  const { h, cwd } = fixture();
  const calls = [];
  const a = get("openclaw");
  a.install("ignored", { exec: (...c) => calls.push(c) });
  const dir = join(h, ".cue/openclaw-plugin");
  assert.deepEqual(calls[0].slice(0, 2), ["openclaw", ["plugins", "install", dir]]);
  for (const f of ["package.json", "openclaw.plugin.json", "index.js"]) assert.ok(existsSync(join(dir, f)));
  assert.ok(a.isInstalled());
  const handlers = {};
  (await import(pathToFileURL(join(dir, "index.js")).href)).default({ on: (n, fn) => (handlers[n] = fn) });
  const r = await handlers.before_prompt_build({ prompt: "fix ui" }, { sessionKey: "k", workspaceDir: cwd });
  assert.match(r.appendSystemContext, /## Skill: frontend-design/);
  a.uninstall("x", { exec: (...c) => calls.push(c) });
  assert.deepEqual(calls[1].slice(0, 2), ["openclaw", ["plugins", "uninstall", "cue-skills", "--force"]]);
  assert.ok(!a.isInstalled());
});
