import { jsonAdapter } from "./hooksjson.js";
import { observe } from "../observe.js";
import { testFailure } from "../signals.js";

export const prompt = (i) => ({ phase: "prompt", prompt: i.prompt });
export const start = (i) => ({ phase: "start", reset: ["compact", "clear"].includes(i.source) });

// Bash result -> picker query, only when a test runner failed. PostToolUse carries the output; PostToolUseFailure an error string.
const failed = (i, output, exitCode) =>
  testFailure({ command: i.tool_input?.command ?? "", output, exitCode }) ? { phase: "tool", tool: "Bash", failure: true, auto: true } : null;

export const MAP = {
  SessionStart: start,
  UserPromptSubmit: (i) => ({ ...prompt(i), auto: true }), // picker and enforcer: Claude only
  PreToolUse: (i) => ({ phase: "tool", tool: i.tool_name ?? "", files: [i.tool_input?.file_path].filter(Boolean), auto: true }),
  PostToolUse: (i) => {
    const r = i.tool_response ?? {};
    return failed(i, [r.stdout, r.stderr].filter((x) => typeof x === "string").join("\n"), r.exit_code ?? r.exitCode ?? null);
  },
  PostToolUseFailure: (i) => failed(i, String(i.error ?? ""), 1),
  SubagentStart: () => ({ phase: "system" }),
};

const base = jsonAdapter({
  id: "claude", label: "Claude Code", status: "tested", dir: ".claude", fileName: "settings.json",
  spec: [
    { event: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 5 },
    { event: "UserPromptSubmit", timeout: 5 },
    { event: "PreToolUse", matcher: "Read|Edit|Write|MultiEdit|mcp__.*", timeout: 5 },
    { event: "PostToolUse", matcher: "Bash", timeout: 5 },
    { event: "PostToolUseFailure", matcher: "Bash", timeout: 5 },
    { event: "SubagentStart", timeout: 5 },
    { event: "Stop", timeout: 5 },
  ],
  map: MAP,
});

export default { ...base, handle: (event, input) => (event === "Stop" ? observe(input) : base.handle(event, input)) };
