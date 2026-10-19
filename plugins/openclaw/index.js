// cue-skills OpenClaw plugin (template; install replaces __CUE_ENGINE__ with file:// URL of src/engine.js).
// Verified vs OpenClaw 2026.4.26 (dist/agent-harness-runtime, loader, types):
//  - Entry: plain `export default function (api)` (as headroom does); definePluginEntry not required.
//  - api.on("before_prompt_build", (event {prompt, messages}, ctx {sessionKey, sessionId, workspaceDir, agentId,...}))
//    may return {appendSystemContext, prependSystemContext, ...}.
//  - Per-prompt reminder: also returns prependContext (PluginHookBeforePromptBuildResult; the runtime does
//    `${prependContext}\n\n${prompt}`, i.e. user-turn level, every turn). Chosen over prependSystemContext /
//    appendSystemContext, which are cached system-prompt slots and sit far from the prompt (the drift cause).
//    Bodies stay in appendSystemContext; prependContext carries only the one-line "Active skills: ..." reminder.
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
      const a = {
        agent: "openclaw",
        session: ctx?.sessionKey ?? ctx?.sessionId ?? "default",
        prompt: event?.prompt ?? "",
        cwd: ctx?.workspaceDir ?? process.cwd(),
      };
      const sys = (await mod.run({ ...a, phase: "system" })).text;
      const rem = (await mod.run({ ...a, phase: "remind" })).text;
      if (!sys && !rem) return undefined;
      return { ...(sys && { appendSystemContext: sys }), ...(rem && { prependContext: rem }) };
    } catch { return {}; }
  });
}
