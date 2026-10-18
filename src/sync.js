import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { atomicWrite } from "./jsonfile.js";
import { join } from "node:path";
import { projectRoot, expandHome } from "./paths.js";
import { loadRules } from "./rules.js";
import { loadCatalog } from "./catalog.js";
import { select } from "./select.js";
import { renderFull } from "./render.js";

const START = "<!-- cue-skills:start -->";
const END = "<!-- cue-skills:end -->";

function write(f, text) {
  if (existsSync(f) && !existsSync(f + ".bak")) copyFileSync(f, f + ".bak");
  atomicWrite(f, text);
}

export function syncAgentsMd(cwd) {
  const root = projectRoot(cwd);
  const rules = loadRules(cwd);
  const catalog = loadCatalog({ cwd, extraDirs: rules.skillDirs.map(expandHome) });
  const { selected } = select({ prompt: "", files: [], cwd, rules: { ...rules, when: [] }, catalog });
  const bodies = renderFull(selected.map((s) => s.entry), Infinity);
  const block = `${START}\n${bodies}${END}`;

  const md = join(root, "AGENTS.md");
  const old = existsSync(md) ? readFileSync(md, "utf8") : "";
  const a = old.indexOf(START), b = old.indexOf(END, a);
  // unmatched START: replace to end of file
  const next = a >= 0 ? old.slice(0, a) + block + (b >= 0 ? old.slice(b + END.length) : "\n")
    : (old && !old.endsWith("\n") ? old + "\n" : old) + (old ? "\n" : "") + block + "\n";
  write(md, next);

  const out = [`AGENTS.md: ${selected.length} skill(s) synced at ${md}`];
  if (existsSync(join(root, ".cursor"))) {
    const mdc = join(root, ".cursor/rules/cue-skills.mdc");
    mkdirSync(join(root, ".cursor/rules"), { recursive: true });
    write(mdc, `---\ndescription: cue-skills active skills\nalwaysApply: true\n---\n${bodies}`);
    out.push(`Cursor rule written at ${mdc}`);
  }
  return out.join("\n");
}
