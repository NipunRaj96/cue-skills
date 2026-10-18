import { jsonAdapter } from "./hooksjson.js";
import { start, prompt } from "./claude.js";

export default jsonAdapter({
  id: "codex", label: "Codex", status: "experimental", dir: ".codex", fileName: "hooks.json",
  spec: [
    { event: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 5 },
    { event: "UserPromptSubmit", timeout: 5 },
  ],
  map: { SessionStart: start, UserPromptSubmit: prompt },
  suffix: " Run /hooks in Codex to trust them.",
});
