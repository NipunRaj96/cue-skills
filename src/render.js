import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseSkill } from "./frontmatter.js";

const readLine = (e) => `## Skill: ${e.name}\nRead ${e.path} and follow it.\n`;

export function renderFull(entries, budget = 9000) {
  let out = "";
  for (const e of entries) {
    let block;
    try {
      const { body } = parseSkill(readFileSync(e.path, "utf8"));
      block = `## Skill: ${e.name}\nSkill dir: ${dirname(e.path)}\n${body.endsWith("\n") ? body : body + "\n"}`;
    } catch { block = readLine(e); }
    out += out.length + block.length > budget ? readLine(e) : block;
  }
  return out;
}

export function reminder(entries) {
  if (!entries.length) return "";
  return `Active skills: ${entries.map((e) => `${e.name} (${(e.description ?? "").slice(0, 80)})`).join(", ")}.`;
}
