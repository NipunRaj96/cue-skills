// Score drift sessions: per user turn, output tokens and caveman metrics of the final reply.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { checkReply } from "/Users/hariomkumar/Playground/cue-skills/src/enforce.js";

const P = join(homedir(), ".claude/projects");
const arms = { ctrl: (process.env.CTRL||"vigorous-blackburn,cool-montalcini").split(","), cue: (process.env.CUE||"quizzical-nightingale,infallible-greider").split(",") };
const latest = (b) => {
  const d = readdirSync(P).find((x) => x.includes(b));
  const fs = readdirSync(join(P, d)).filter((f) => f.endsWith(".jsonl")).map((f) => join(P, d, f));
  return fs.sort((a, c) => statSync(c).mtimeMs - statSync(a).mtimeMs)[0];
};
const isPrompt = (e) => e.type === "user" && !e.isMeta && (typeof e.message?.content === "string" ||
  (Array.isArray(e.message?.content) && e.message.content.some((c) => c.type === "text") && !e.message.content.some((c) => c.type === "tool_result")));

const out = {};
for (const [arm, bs] of Object.entries(arms)) for (const b of bs) {
  const rows = readFileSync(latest(b), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const turns = []; let cur = null; const seen = new Set();
  for (const e of rows) {
    if (isPrompt(e)) { cur = { tok: 0, text: "" }; turns.push(cur); continue; }
    if (!cur || e.type !== "assistant") continue;
    const id = e.message?.id; const u = e.message?.usage;
    if (u && id && !seen.has(id)) { seen.add(id); cur.tok += u.output_tokens || 0; }
    const t = (e.message?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (t.trim()) cur.text = t;
  }
  out[b] = turns.map((t, i) => { const r = checkReply("caveman", t.text) || {}; return { turn: i + 1, tok: t.tok, words: t.text.split(/\s+/).filter(Boolean).length, filler: r.metrics?.ratio ?? null, drift: r.ok === false }; });
  out[b].arm = arm;
}
for (const [b, ts] of Object.entries(out)) {
  console.log(`\n${ts.arm} ${b}: turns=${ts.length}`);
  console.log(ts.map((t) => `t${t.turn}:${t.tok}tok/${t.words}w/${t.filler == null ? "-" : (t.filler * 100).toFixed(1) + "%"}${t.drift ? "!" : ""}`).join("  "));
  const tot = ts.reduce((s, t) => s + t.tok, 0), dr = ts.filter((t) => t.drift).length;
  console.log(`total out tokens ${tot}, drifted turns ${dr}/${ts.length}`);
}
