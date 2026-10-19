import { readdirSync, statSync, lstatSync, realpathSync, existsSync } from "node:fs";
import { join, basename, dirname, sep } from "node:path";
import { home, cueDir, ensureCueDir, projectRoot, expandHome } from "./paths.js";
import { parseSkill } from "./frontmatter.js";
import { readJson, writeJson } from "./jsonfile.js";
import { readRegular } from "./safefile.js";

const GLOBAL = [".claude/skills", ".agents/skills", ".config/opencode/skills", ".openclaw/skills",
  ".gemini/config/skills", ".gemini/skills", ".cursor/skills", ".codex/skills"];
const PROJECT = [".claude/skills", ".agents/skills", ".opencode/skills"];
export const MAX_SKILL = 256 * 1024;
const MAX_DIRS = 20000;
const KIND_ORDER = ["project", "user", "plugin"];

// follow=false (project roots): symlinked directories are never listed
const dirs = (p, follow = true) => {
  try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() || (follow && d.isSymbolicLink())).map((d) => d.name); }
  catch { return []; }
};
const isSemver = (v) => /^\d+(\.\d+)*$/.test(v);
// semver beats non-semver; semver numeric part by part; others lexical
function cmpVer(a, b) {
  if (isSemver(a) !== isSemver(b)) return isSemver(a) ? 1 : -1;
  if (!isSemver(a)) return a < b ? -1 : a > b ? 1 : 0;
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const inside = (p, base) => p === base || p.startsWith(base + sep);

export function scanRoots({ cwd, rules = {} }) {
  const roots = [];
  const add = (root, kind, plugin) => existsSync(root) && roots.push(plugin ? { root, kind, plugin } : { root, kind });
  const proj = projectRoot(cwd);
  if (rules.projectStatus === "trusted") {
    let base;
    try { base = realpathSync(proj); } catch { base = null; }
    for (const root of [...PROJECT.map((p) => join(proj, p)), ...(rules.projectSkillDirs ?? [])]) {
      try {
        // a real directory (not a link) whose resolved path stays inside the project
        if (base && lstatSync(root).isDirectory() && inside(realpathSync(root), base)) roots.push({ root, kind: "project", base });
      } catch { /* absent */ }
    }
  }
  for (const p of GLOBAL) add(join(home(), p), "user");
  const cache = join(home(), ".claude/plugins/cache");
  for (const market of dirs(cache))
    for (const plugin of dirs(join(cache, market))) {
      const latest = dirs(join(cache, market, plugin)).sort(cmpVer).pop();
      if (latest) add(join(cache, market, plugin, latest, "skills"), "plugin", plugin);
    }
  for (const d of rules.skillDirs ?? []) add(expandHome(d), "user");
  return roots;
}

// budget is shared by every root of one scan
function walk(dir, depth, seen, out, root, budget) {
  let real;
  try { real = realpathSync(dir); } catch { return; }
  if (seen.has(real) || budget.n >= MAX_DIRS) return;
  seen.add(real); budget.n++;
  const file = join(dir, "SKILL.md");
  if (existsSync(file)) out.push(file); // content checks happen in readRegular
  if (depth >= 6) return;
  for (const n of dirs(dir, root.kind !== "project").sort())
    if (n !== "node_modules" && n !== ".git") walk(join(dir, n), depth + 1, seen, out, root, budget);
}

export function buildCatalog(roots) {
  const entries = [], budget = { n: 0 };
  // user/plugin roots first: a huge project cannot use up the shared dir budget
  for (const r of [...roots].sort((a, b) => (a.kind === "project") - (b.kind === "project"))) {
    const { root, kind, plugin } = r;
    const files = [];
    walk(root, 0, new Set(), files, r, budget);
    for (const path of files) {
      try {
        const text = readRegular(path, MAX_SKILL, kind === "project" ? { base: r.base, nofollow: true } : {});
        if (text === null) continue;
        const { meta } = parseSkill(text);
        entries.push({
          name: String(meta.name || basename(dirname(path))),
          plugin: plugin ?? null,
          description: String(meta.description ?? ""),
          path, size: Buffer.byteLength(text), kind, base: kind === "project" ? r.base : null,
        });
      } catch { /* unreadable or bad yaml: skip */ }
    }
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function loadCatalog({ cwd, rules }) {
  const roots = scanRoots({ cwd, rules });
  const key = JSON.stringify(roots.map((r) => [r.root, statSync(r.root).mtimeMs]));
  const file = join(cueDir(), "catalog.json");
  try {
    const c = readJson(file, null);
    if (c && c.key === key) return c.entries;
  } catch { /* corrupt cache: rebuild */ }
  const entries = buildCatalog(roots);
  try { ensureCueDir(); writeJson(file, { key, entries }, 0o600); } catch { /* cache is optional */ }
  return entries;
}

export function resolve(catalog, name) {
  const i = name.indexOf(":");
  if (i > 0) {
    const [p, n] = [name.slice(0, i), name.slice(i + 1)];
    return catalog.find((e) => e.plugin === p && e.name === n) ?? null;
  }
  for (const k of KIND_ORDER) {
    const e = catalog.find((x) => x.kind === k && x.name === name);
    if (e) return e;
  }
  return null;
}
