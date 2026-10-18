import { get } from "./adapters/index.js";

export function runHook(id, event, stdinText) {
  try {
    const adapter = get(id);
    if (!adapter) return "";
    const input = JSON.parse(stdinText);
    if (!input || typeof input !== "object") return "";
    return adapter.handle(event, input) || "";
  } catch {
    return "";
  }
}
