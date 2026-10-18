// cue-skills OpenCode plugin (template; install replaces __CUE_ENGINE__ with file:// URL of src/engine.js).
// Verified vs @opencode-ai/plugin types (OpenCode 1.14.29):
//  "chat.message"(input {sessionID, ...}, output {message, parts})
//  "experimental.chat.system.transform"(input {sessionID?, model}, output {system: string[]})
// Never throws into OpenCode.
import { run } from "__CUE_ENGINE__";

export const CueSkills = async ({ directory }) => {
  const lastPrompt = {};
  return {
    "chat.message": async (input, output) => {
      try {
        lastPrompt[input.sessionID] = (output.parts || [])
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text).join("\n");
      } catch {}
    },
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const session = input.sessionID ?? "default";
        const { text } = await run({ agent: "opencode", session, phase: "system", prompt: lastPrompt[session] ?? "", cwd: directory });
        if (text) output.system.push(text);
      } catch {}
    },
  };
};
