import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { parseSkill } from "./frontmatter.js";
import { MAX_SKILL } from "./catalog.js";

const readLine = (e) => `## Skill: ${e.name}\nRead ${e.path} and follow it.\n`;

export function renderFull(entries, budget = 9000) {
  let out = "";
  for (const e of entries) {
    let block;
    try {
      const st = statSync(e.path);
      if (!st.isFile() || st.size > MAX_SKILL) throw new Error("not a readable skill file");
      const { body } = parseSkill(readFileSync(e.path, "utf8"));
      block = `## Skill: ${e.name}\nSkill dir: ${dirname(e.path)}\n${body.endsWith("\n") ? body : body + "\n"}`;
    } catch { block = readLine(e); }
    if (out.length + block.length > budget) block = readLine(e);
    if (out.length + block.length <= budget) out += block;
  }
  return out;
}

export const REMINDER_RESERVE = 1000;

export function reminder(entries) {
  if (!entries.length) return "";
  return `Active skills: ${entries.map((e) => `${e.name} (${(e.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80)})`).join(", ")}.`;
}
