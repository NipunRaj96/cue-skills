import { dirname } from "node:path";
import { parseSkill } from "./frontmatter.js";
import { MAX_SKILL } from "./catalog.js";
import { readRegular } from "./safefile.js";

const readLine = (e) => `## Skill: ${e.name}\nRead ${e.path} and follow it.\n`;

export function renderFull(entries, budget = 9000) {
  let out = "";
  for (const e of entries) {
    let block;
    try {
      // project entries: never follow a link, stay inside the project (the cached catalog may be stale)
      const text = readRegular(e.path, MAX_SKILL, e.kind === "project" ? { base: e.base || "\0", nofollow: true } : {});
      if (text === null) throw new Error("not a readable skill file");
      const { body } = parseSkill(text);
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
