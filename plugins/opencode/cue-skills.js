// cue-skills OpenCode plugin (template; install replaces __CUE_ENGINE__ with file:// URL of src/engine.js).
// Verified vs @opencode-ai/plugin types (OpenCode 1.14.29):
//  "chat.message"(input {sessionID, ...}, output {message, parts})
//  "experimental.chat.system.transform"(input {sessionID?, model}, output {system: string[]})
// Per-prompt reminder: "chat.message" also pushes one synthetic TextPart ("Active skills: ...") into output.parts,
// next to the user prompt (Part shape per @opencode-ai/sdk TextPart: id, sessionID, messageID, type "text", text, synthetic).
// Never throws into OpenCode.

// Mimics OpenCode's ascending part ids (prt_ + 12 hex of time*4096 + 14 random) so the part sorts after the prompt.
const partId = () => "prt_" + (Date.now() * 0x1000).toString(16).padStart(12, "0") +
  Array.from({ length: 14 }, () => "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 62)]).join("");

export const CueSkills = async ({ directory }) => {
  let run;
  try { ({ run } = await import("__CUE_ENGINE__")); } catch { return {}; } // fail open: stale engine path
  const lastPrompt = {};
  return {
    "chat.message": async (input, output) => {
      try {
        lastPrompt[input.sessionID] = (output.parts || [])
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text).join("\n");
        const { text } = await run({ agent: "opencode", session: input.sessionID, phase: "remind", prompt: lastPrompt[input.sessionID], cwd: directory });
        if (text) output.parts.push({
          id: partId(),
          sessionID: input.sessionID,
          messageID: output.message?.id ?? output.parts[0]?.messageID,
          type: "text", text, synthetic: true,
        });
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
