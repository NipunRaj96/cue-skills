import { jsonAdapter } from "./hooksjson.js";

export const prompt = (i) => ({ phase: "prompt", prompt: i.prompt });
export const start = (i) => ({ phase: "start", reset: ["compact", "clear"].includes(i.source) });

export default jsonAdapter({
  id: "claude", label: "Claude Code", status: "tested", dir: ".claude", fileName: "settings.json",
  spec: [
    { event: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 5 },
    { event: "UserPromptSubmit", timeout: 5 },
    { event: "PreToolUse", matcher: "Read|Edit|Write|MultiEdit", timeout: 5 },
    { event: "SubagentStart", timeout: 5 },
  ],
  map: {
    SessionStart: start,
    UserPromptSubmit: prompt,
    PreToolUse: (i) => ({ phase: "tool", files: [i.tool_input?.file_path].filter(Boolean) }),
    SubagentStart: () => ({ phase: "system" }),
  },
});
