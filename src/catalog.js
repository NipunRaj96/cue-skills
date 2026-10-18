import { readdirSync, readFileSync, statSync, realpathSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { home, cueDir, projectRoot, expandHome } from "./paths.js";
import { parseSkill } from "./frontmatter.js";
import { readJson, writeJson } from "./jsonfile.js";

const GLOBAL = [".claude/skills", ".agents/skills", ".config/opencode/skills", ".openclaw/skills",
  ".gemini/config/skills", ".gemini/skills", ".cursor/skills", ".codex/skills"];
const PROJECT = [".claude/skills", ".agents/skills", ".opencode/skills"];
const KIND_ORDER = ["project", "user", "plugin"];

const dirs = (p) => {
  try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name); }
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

export function scanRoots({ cwd, extraDirs = [] }) {
  const roots = [];
  const add = (root, kind, plugin) => existsSync(root) && roots.push(plugin ? { root, kind, plugin } : { root, kind });
  const proj = projectRoot(cwd);
  for (const p of PROJECT) add(join(proj, p), "project");
  for (const p of GLOBAL) add(join(home(), p), "user");
  const cache = join(home(), ".claude/plugins/cache");
  for (const market of dirs(cache))
    for (const plugin of dirs(join(cache, market))) {
      const latest = dirs(join(cache, market, plugin)).sort(cmpVer).pop();
      if (latest) add(join(cache, market, plugin, latest, "skills"), "plugin", plugin);
    }
  for (const d of extraDirs) add(expandHome(d), "user");
  return roots;
}

function walk(dir, depth, seen, out) {
  let real;
  try { real = realpathSync(dir); } catch { return; }
  if (seen.has(real)) return;
  seen.add(real);
  const file = join(dir, "SKILL.md");
  if (existsSync(file)) out.push(file);
  if (depth >= 6) return;
  for (const n of dirs(dir).sort())
    if (n !== "node_modules" && n !== ".git") walk(join(dir, n), depth + 1, seen, out);
}

export function buildCatalog(roots) {
  const entries = [];
  for (const { root, kind, plugin } of roots) {
    const files = [];
    walk(root, 0, new Set(), files);
    for (const path of files) {
      try {
        const { meta } = parseSkill(readFileSync(path, "utf8"));
        entries.push({
          name: String(meta.name || basename(dirname(path))),
          plugin: plugin ?? null,
          description: String(meta.description ?? ""),
          path, size: statSync(path).size, kind,
        });
      } catch { /* unreadable or bad yaml: skip */ }
    }
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function loadCatalog({ cwd, extraDirs }) {
  const roots = scanRoots({ cwd, extraDirs });
  const key = JSON.stringify(roots.map((r) => [r.root, statSync(r.root).mtimeMs]));
  const file = join(cueDir(), "catalog.json");
  try {
    const c = readJson(file, null);
    if (c && c.key === key) return c.entries;
  } catch { /* corrupt cache: rebuild */ }
  const entries = buildCatalog(roots);
  writeJson(file, { key, entries });
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
