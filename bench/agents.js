// One adapter per agent. turn() returns { text, usageOut (null if unknown), error }.
// All commands were verified against the real CLIs; see bench/README.md for the notes.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = "/tmp/cue-bench";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OLLAMA_MODEL = "gemma4:31b-cloud";
export const TURN_TIMEOUT_MS = 300_000;

function run(cmd, args, { cwd, env = {}, timeout = TURN_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let out = "", err = "", timedOut = false;
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => { timedOut = true; try { process.kill(-p.pid, "SIGKILL"); } catch { /* gone */ } }, timeout);
    p.on("error", (e) => { clearTimeout(t); resolve({ out, err: String(e), code: -1, timedOut }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ out, err, code, timedOut }); });
  });
}

const jsonLines = (s) => s.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const fail = (r, msg) => ({ text: "", usageOut: null, error: r.timedOut ? "timeout" : msg || `exit ${r.code}: ${r.err.slice(0, 200)}` });

export function parseClaude(out) {
  const j = JSON.parse(out);
  if (j.is_error) return { text: String(j.result ?? ""), usageOut: null, error: String(j.result || j.subtype) };
  return { text: String(j.result ?? ""), usageOut: j.usage?.output_tokens ?? null, steps: j.num_turns ?? null, sessionId: j.session_id };
}

export function parseOpencode(out) {
  const ev = jsonLines(out);
  const err = ev.find((e) => e.type === "error");
  const text = ev.filter((e) => e.type === "text").map((e) => e.part?.text ?? "").join("\n");
  const fin = ev.filter((e) => e.type === "step_finish");
  const usageOut = fin.length ? fin.reduce((n, e) => n + (e.part?.tokens?.output ?? 0), 0) : null;
  return { text, usageOut, steps: fin.length || null, error: err ? JSON.stringify(err.error ?? err).slice(0, 200) : undefined };
}

export function parseOpenclaw(out) {
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const text = (j.payloads ?? []).map((p) => p.text ?? "").join("\n");
  return { text, usageOut: j.meta?.agentMeta?.usage?.output ?? null, error: j.meta?.aborted ? "aborted" : undefined };
}

// agy usage is cumulative per conversation: caller passes the previous cumulative value
export function parseAgy(out, prevCum = 0, prevSteps = 0) {
  const j = JSON.parse(out);
  const cum = j.usage?.output_tokens;
  const ok = j.status === "SUCCESS";
  return { text: String(j.response ?? ""), usageOut: Number.isFinite(cum) ? cum - prevCum : null, cum, steps: Number.isFinite(j.num_turns) ? j.num_turns - prevSteps : null, cumSteps: j.num_turns, sessionId: j.conversation_id, error: ok ? undefined : String(j.status) };
}

// codex usage is cumulative per thread too
export function parseCodex(out, prevCum = 0) {
  const ev = jsonLines(out);
  const text = ev.filter((e) => e.type === "item.completed" && e.item?.type === "agent_message").map((e) => e.item.text).join("\n");
  const done = ev.filter((e) => e.type === "turn.completed").pop();
  const bad = ev.find((e) => e.type === "turn.failed" || e.type === "error");
  const cum = done?.usage?.output_tokens;
  return { text, usageOut: Number.isFinite(cum) ? cum - prevCum : null, cum, error: bad ? JSON.stringify(bad).slice(0, 200) : done ? undefined : "no turn.completed" };
}

// Claude Code: the user's own caveman/ponytail plugins are switched off in every mode,
// so only the mode under test can inject them.
function claudeSettings(runDir, mode) {
  const cfg = { enabledPlugins: { "caveman@caveman": false, "ponytail@ponytail": false } };
  if (mode === "cue") {
    const hook = (ev) => ({ type: "command", command: `'${process.execPath}' '${REPO}/bin/cue-skills.js' hook claude ${ev}`, timeout: 5 });
    cfg.hooks = {
      SessionStart: [{ matcher: "startup|resume|clear|compact", hooks: [hook("SessionStart")] }],
      UserPromptSubmit: [{ hooks: [hook("UserPromptSubmit")] }],
    };
  }
  const f = join(runDir, ".cue-bench-settings.json");
  writeFileSync(f, JSON.stringify(cfg));
  return f;
}

export const AGENTS = {
  claude: {
    label: "Claude Code",
    async open(runDir, mode) { return { settings: claudeSettings(runDir, mode), n: 0 }; },
    async turn(s, runDir, prompt) {
      const a = ["launch", "claude", "--model", OLLAMA_MODEL, "-y", "--", "-p", prompt, "--settings", s.settings, "--output-format", "json", "--dangerously-skip-permissions"];
      if (s.n++) a.push("-c");
      const r = await run("ollama", a, { cwd: runDir });
      if (r.timedOut || !r.out.trim()) return fail(r);
      try { return parseClaude(r.out); } catch (e) { return fail(r, `parse: ${e.message}`); }
    },
  },
  opencode: {
    label: "OpenCode",
    async open(runDir) {
      writeFileSync(join(runDir, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", provider: { ollama: { models: { [OLLAMA_MODEL]: {} } } } }));
      return { n: 0 };
    },
    async turn(s, runDir, prompt) {
      const a = ["run", "-m", `ollama/${OLLAMA_MODEL}`, "--format", "json", "--dangerously-skip-permissions"];
      if (s.n++) a.push("-c");
      const r = await run("opencode", [...a, prompt], { cwd: runDir });
      if (r.timedOut || !r.out.trim()) return fail(r);
      try { return parseOpencode(r.out); } catch (e) { return fail(r, `parse: ${e.message}`); }
    },
  },
  openclaw: {
    label: "OpenClaw",
    // The cue-bench agent has a fixed workspace, /tmp/cue-bench/oc-ws, a symlink we point at each run dir.
    async open(runDir) {
      const ws = join(ROOT, "oc-ws");
      rmSync(ws, { force: true, recursive: true });
      symlinkSync(runDir, ws);
      return { sid: `bench-${Date.now()}` };
    },
    async turn(s, runDir, prompt) {
      const a = ["agent", "--local", "--agent", "cue-bench", "--json", "--session-id", s.sid, "-m", prompt];
      const r = await run("openclaw", a, { cwd: runDir });
      if (r.timedOut || !r.out.includes("{")) return fail(r);
      try { return parseOpenclaw(r.out); } catch (e) { return fail(r, `parse: ${e.message}`); }
    },
  },
  antigravity: {
    label: "Antigravity",
    async open() { return { id: null, cum: 0 }; },
    async turn(s, runDir, prompt) {
      const a = ["-p", prompt, "--model", "claude-sonnet-4-6", "--output-format", "json", "--dangerously-skip-permissions", "--sandbox"];
      if (s.id) a.push("--conversation", s.id);
      const r = await run("agy", a, { cwd: runDir });
      if (r.timedOut || !r.out.trim()) return fail(r);
      try {
        const p = parseAgy(r.out, s.cum, s.steps ?? 0);
        if (Number.isFinite(p.cumSteps)) s.steps = p.cumSteps;
        s.id = p.sessionId ?? s.id;
        if (Number.isFinite(p.cum)) s.cum = p.cum;
        return p;
      } catch (e) { return fail(r, `parse: ${e.message}`); }
    },
  },
  codex: {
    label: "Codex",
    skipModes: { cue: "skipped: hooks untrusted" },
    // Isolated CODEX_HOME: the user's ~/.codex/config.toml has a legacy profile key the current
    // codex rejects, and this keeps their config untouched.
    async open() {
      const home = join(ROOT, "codex-home");
      mkdirSync(home, { recursive: true });
      return { home, n: 0, cum: 0 };
    },
    async turn(s, runDir, prompt) {
      const a = ["launch", "codex", "--model", OLLAMA_MODEL, "-y", "--", "exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"];
      if (s.n++) a.push("resume", "--last");
      const r = await run("ollama", [...a, prompt], { cwd: runDir, env: { CODEX_HOME: s.home } });
      if (r.timedOut || !r.out.trim()) return fail(r);
      try {
        const p = parseCodex(r.out, s.cum);
        if (Number.isFinite(p.cum)) s.cum = p.cum;
        return p;
      } catch (e) { return fail(r, `parse: ${e.message}`); }
    },
    finish() { spawnSync("ollama", ["launch", "codex", "--restore"], { stdio: "ignore" }); },
  },
};
