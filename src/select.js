import { realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { projectRoot } from "./paths.js";
import { matchGlob } from "./glob.js";
import { resolve } from "./catalog.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, "iu");

export function select({ prompt = "", files = [], cwd, rules, catalog }) {
  const root = projectRoot(cwd);
  const rel = files.map((f) => relative(root, f).replace(/\\/g, "/")).filter((f) => f !== ".." && !f.startsWith("../"));
  const errors = [];
  // a marker counts only if it really lives inside the repo (a symlink out is not an oracle)
  let rr; try { rr = realpathSync(root); } catch { rr = null; }
  const marker = (x) => {
    try { const p = realpathSync(join(root, x)); return rr !== null && (p === rr || p.startsWith(rr + sep)); } catch { return false; }
  };
  const glob = (x) => {
    try { return rel.some((f) => matchGlob(x, f)); }
    catch (e) { errors.push(`files: ${x.slice(0, 40)}: ${e.message}, skipped`); return false; }
  };
  const cands = rules.always.map((name) => [name, "always"]);
  for (const w of rules.when) {
    const p = w.prompt?.find((x) => word(x).test(prompt));
    const g = w.files?.find(glob);
    const m = w.project?.find((x) => marker(x));
    const reason = p != null ? `prompt:"${p}"` : g != null ? `files:${g}` : m != null ? `project:${m}` : null;
    if (reason) for (const name of w.use) cands.push([name, reason]);
  }
  const selected = [], unresolved = [], seen = new Set();
  for (const [name, reason] of cands) {
    if (rules.never.includes(name) || seen.has(name)) continue;
    seen.add(name);
    // names from global rules never resolve from project roots; only names the project introduced may
    const entry = resolve(rules.projectNames?.has(name) ? catalog : catalog.filter((e) => e.kind !== "project"), name);
    if (!entry) { unresolved.push(name); continue; }
    const id = entry.plugin ? `${entry.plugin}:${entry.name}` : entry.name;
    if (rules.never.includes(entry.name) || rules.never.includes(id)) continue;
    selected.push({ entry, reason });
  }
  return { selected, unresolved, errors };
}
