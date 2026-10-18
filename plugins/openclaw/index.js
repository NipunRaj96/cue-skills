// cue-skills OpenClaw plugin (template; install replaces __CUE_ENGINE__ with file:// URL of src/engine.js).
// Verified vs OpenClaw 2026.4.26 (dist/agent-harness-runtime, loader, types):
//  - Entry: plain `export default function (api)` (as headroom does); definePluginEntry not required.
//  - api.on("before_prompt_build", (event {prompt, messages}, ctx {sessionKey, sessionId, workspaceDir, agentId,...}))
//    may return {appendSystemContext, prependSystemContext, ...}.
//  - Gating: before_prompt_build is a prompt-injection hook (blocked only if
//    plugins.entries.<id>.hooks.allowPromptInjection === false). It is NOT a conversation hook, so
//    allowConversationAccess is not needed (only llm_input/llm_output/before_agent_finalize/agent_end).
let engine;
const load = async () => (engine ??= import("__CUE_ENGINE__").catch(() => null));

export default function (api) {
  api.on("before_prompt_build", async (event, ctx) => {
    try {
      const mod = await load();
      if (!mod) return {};
      const { text } = await mod.run({
        agent: "openclaw",
        session: ctx?.sessionKey ?? ctx?.sessionId ?? "default",
        phase: "system",
        prompt: event?.prompt ?? "",
        cwd: ctx?.workspaceDir ?? process.cwd(),
      });
      return text ? { appendSystemContext: text } : undefined;
    } catch { return {}; }
  });
}
