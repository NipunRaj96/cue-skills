import { join, dirname, resolve, isAbsolute, relative, sep } from "node:path";
import { parse } from "yaml";
import { cueDir, projectRoot } from "./paths.js";
import { readTrusted, realRoot, sha } from "./trust.js";
import { readChecked } from "./safefile.js";

const MAX_RULES = 64 * 1024;
const unc = (d) => /^(\\\\|\/\/)/.test(d);

// string -> [string]; undefined -> []; anything else -> error + []
function list(v, where, errors) {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  errors.push(`${where}: expected string or list of strings`);
  return [];
}

// root set => project file: skillDirs must stay inside it, no ~ or absolute paths
function readRules(file, text, errors, root) {
  const out = { always: [], never: [], when: [], skillDirs: [], picker: true };
  let doc;
  try { doc = parse(text); }
  catch (e) { errors.push(`${file}: ${e.message}`); return out; }
  if (doc == null) return out;
  if (typeof doc !== "object" || Array.isArray(doc)) { errors.push(`${file}: expected a mapping`); return out; }
  if (doc.picker != null && typeof doc.picker !== "boolean") errors.push(`${file}: picker: expected true or false`);
  else if (doc.picker === false) out.picker = false;
  for (const k of ["always", "never", "skillDirs"]) out[k] = list(doc[k], `${file}: ${k}`, errors);
  // relative skillDirs resolve against the rules file's directory
  out.skillDirs = out.skillDirs.flatMap((d) => {
    const bad = (why) => { errors.push(`${file}: skillDirs: ${d}: ${why}`); return []; };
    if (unc(d)) return bad("UNC paths are not allowed");
    if (!root) return [isAbsolute(d) || d.startsWith("~") ? d : resolve(dirname(file), d)];
    if (isAbsolute(d) || d.startsWith("~")) return bad("project skillDirs must be relative");
    const abs = resolve(dirname(file), d), rel = relative(root, abs);
    return rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel) ? bad("escapes the project root") : [abs];
  });
  if (doc.when != null && !Array.isArray(doc.when)) errors.push(`${file}: when: expected a list`);
  for (const [i, w] of (Array.isArray(doc.when) ? doc.when : []).entries()) {
    const at = `${file}: when[${i}]`;
    if (!w || typeof w !== "object" || Array.isArray(w)) { errors.push(`${at}: expected a mapping`); continue; }
    const rule = {};
    for (const k of ["prompt", "files", "project"]) rule[k] = list(w[k], `${at}.${k}`, errors);
    rule.project = rule.project.filter((m) => {
      const bad = isAbsolute(m) || m.startsWith("~") || m.split(/[\\/]/).includes("..");
      if (bad) errors.push(`${at}.project: ${m}: must be relative and stay inside the project`);
      return !bad;
    });
    const n = errors.length;
    rule.use = list(w.use, `${at}.use`, errors);
    if (rule.use.length) out.when.push(rule);
    else if (errors.length === n) errors.push(`${at}: missing use`);
  }
  return out;
}

const names = (r) => [...r.always, ...r.when.flatMap((w) => w.use)];

export function loadRules(cwd) {
  const errors = [];
  const empty = () => ({ always: [], never: [], when: [], skillDirs: [] });
  const gfile = join(cueDir(), "rules.yaml");
  const g0 = readChecked(gfile, MAX_RULES);
  if (g0.error) errors.push(g0.error);
  const g = g0.data ? readRules(gfile, g0.data, errors) : empty();

  // project rules: ignored unless the user trusted exactly this content
  const root = projectRoot(cwd);
  const pfile = join(root, ".cue", "rules.yaml");
  const p0 = readChecked(pfile, MAX_RULES, { base: root, nofollow: true, owned: true });
  let projectStatus = "none", p = empty();
  if (p0.error) { errors.push(p0.error); projectStatus = "untrusted"; }
  else if (p0.data) {
    const t = readTrusted()[realRoot(root)];
    projectStatus = t == null ? "untrusted" : t !== sha(p0.data) ? "changed" : "trusted";
    if (projectStatus === "trusted") p = readRules(pfile, p0.data, errors, root);
  }

  // names only the project introduced: only those may resolve from project roots or be vetoed by it
  const global = new Set(names(g));
  const projectNames = new Set(names(p).filter((n) => !global.has(n)));
  const pnever = p.never.filter((n) => projectNames.has(n));
  for (const n of p.never) if (!projectNames.has(n)) errors.push(`${pfile}: never: ${n}: ignored, project rules may only remove skills they add`);
  const dedupe = (a) => [...new Set(a)];
  return {
    always: dedupe([...g.always, ...p.always]), never: dedupe([...g.never, ...pnever]),
    when: [...g.when, ...p.when], skillDirs: dedupe(g.skillDirs), projectSkillDirs: dedupe(p.skillDirs),
    projectNames, projectStatus, errors,
    picker: g.picker !== false, // global switch only: a repo cannot turn the picker on or off for you
  };
}
