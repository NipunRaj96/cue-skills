import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { projectRoot } from "./paths.js";
import { globToRegExp } from "./glob.js";
import { resolve } from "./catalog.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, "iu");

export function select({ prompt = "", files = [], cwd, rules, catalog }) {
  const root = projectRoot(cwd);
  const rel = files.map((f) => relative(root, f).replace(/\\/g, "/")).filter((f) => f !== ".." && !f.startsWith("../"));
  const cands = rules.always.map((name) => [name, "always"]);
  for (const w of rules.when) {
    const p = w.prompt?.find((x) => word(x).test(prompt));
    const g = w.files?.find((x) => rel.some((f) => globToRegExp(x).test(f)));
    const m = w.project?.find((x) => existsSync(join(root, x)));
    const reason = p != null ? `prompt:"${p}"` : g != null ? `files:${g}` : m != null ? `project:${m}` : null;
    if (reason) for (const name of w.use) cands.push([name, reason]);
  }
  const selected = [], unresolved = [], seen = new Set();
  for (const [name, reason] of cands) {
    if (rules.never.includes(name) || seen.has(name)) continue;
    seen.add(name);
    const entry = resolve(catalog, name);
    if (!entry) { unresolved.push(name); continue; }
    const id = entry.plugin ? `${entry.plugin}:${entry.name}` : entry.name;
    if (rules.never.includes(entry.name) || rules.never.includes(id)) continue;
    selected.push({ entry, reason });
  }
  return { selected, unresolved };
}
