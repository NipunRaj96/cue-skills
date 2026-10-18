import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { parse } from "yaml";
import { cueDir, projectRoot } from "./paths.js";

// string -> [string]; undefined -> []; anything else -> error + []
function list(v, where, errors) {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  errors.push(`${where}: expected string or list of strings`);
  return [];
}

function readRules(file, errors) {
  const out = { always: [], never: [], when: [], skillDirs: [] };
  if (!existsSync(file)) return out;
  let doc;
  try { doc = parse(readFileSync(file, "utf8")); }
  catch (e) { errors.push(`${file}: ${e.message}`); return out; }
  if (doc == null) return out;
  if (typeof doc !== "object" || Array.isArray(doc)) { errors.push(`${file}: expected a mapping`); return out; }
  for (const k of ["always", "never", "skillDirs"]) out[k] = list(doc[k], `${file}: ${k}`, errors);
  // relative skillDirs resolve against the rules file's directory
  out.skillDirs = out.skillDirs.map((d) => (isAbsolute(d) || d.startsWith("~") ? d : resolve(dirname(file), d)));
  if (doc.when != null && !Array.isArray(doc.when)) errors.push(`${file}: when: expected a list`);
  for (const [i, w] of (Array.isArray(doc.when) ? doc.when : []).entries()) {
    const at = `${file}: when[${i}]`;
    if (!w || typeof w !== "object" || Array.isArray(w)) { errors.push(`${at}: expected a mapping`); continue; }
    const rule = {};
    for (const k of ["prompt", "files", "project"]) rule[k] = list(w[k], `${at}.${k}`, errors);
    const n = errors.length;
    rule.use = list(w.use, `${at}.use`, errors);
    if (rule.use.length) out.when.push(rule);
    else if (errors.length === n) errors.push(`${at}: missing use`);
  }
  return out;
}

export function loadRules(cwd) {
  const errors = [];
  const parts = [
    readRules(join(cueDir(), "rules.yaml"), errors),
    readRules(join(projectRoot(cwd), ".cue", "rules.yaml"), errors),
  ];
  const cat = (k) => [...new Set(parts.flatMap((p) => p[k]))];
  return { always: cat("always"), never: cat("never"), when: parts.flatMap((p) => p.when), skillDirs: cat("skillDirs"), errors };
}
