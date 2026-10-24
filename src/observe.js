import { join } from "node:path";
import { checkReply } from "./enforce.js";
import { loadRules } from "./rules.js";
import { loadCatalog } from "./catalog.js";
import { select } from "./select.js";
import { loadSession, saveSession } from "./state.js";
import { readChecked } from "./safefile.js";
import { home } from "./paths.js";
import { logEvent } from "./log.js";
import { clean } from "./pick.js";

const TAIL = 512 * 1024;
const isString = (x) => typeof x === "string" && x !== "";

// Text of the latest assistant reply in a transcript tail (thinking/tool blocks excluded).
// null when this turn produced no text (a real user prompt comes before any assistant text).
export function lastReply(data) {
  const lines = data.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    const c = o?.message?.content;
    if (o?.type === "assistant") {
      const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text" && isString(b.text)).map((b) => b.text).join("\n") : "";
      if (t) return t;
    } else if (o?.type === "user" && !(Array.isArray(c) && c.every((b) => b?.type === "tool_result"))) return null;
  }
  return null;
}

// Claude Stop hook: flag standing skills the last reply did not follow. Never blocks; returns "" or a systemMessage.
export function observe(input) {
  if (input.stop_hook_active || !isString(input.transcript_path)) return "";
  const cwd = input.cwd || process.cwd(), session = input.session_id || "default";
  const t = readChecked(input.transcript_path, TAIL, { base: join(home(), ".claude"), nofollow: true, owned: true, tail: true });
  if (!t.data) return "";
  const reply = lastReply(t.data);
  if (!reply) return "";
  const rules = loadRules(cwd);
  // standing skills exactly as the engine resolves them: uninstalled or vetoed ones are never flagged
  const catalog = loadCatalog({ cwd, rules });
  const { selected } = select({ prompt: "", files: [], cwd, rules, catalog });
  const found = [];
  for (const { entry, reason } of selected) {
    const r = reason === "always" ? checkReply(entry.name, reply) : null;
    if (r && !r.ok) found.push({ name: entry.name, reason: r.reason });
  }
  if (!found.length) return "";
  const s = loadSession("claude", session);
  for (const f of found) s.drift[f.name] = f.reason;
  saveSession("claude", session, s);
  logEvent({ agent: "claude", session, event: "drift-detected", skills: found });
  return JSON.stringify({ systemMessage: clean(`cue → ${found.map((f) => `${f.name} drift detected: ${f.reason}; re-applying next turn`).join("; ")}`) });
}
