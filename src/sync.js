import { readFileSync, mkdirSync, copyFileSync, lstatSync, realpathSync, writeFileSync, renameSync, constants } from "node:fs";
import { join, dirname, sep } from "node:path";
import { projectRoot } from "./paths.js";
import { loadRules } from "./rules.js";
import { loadCatalog } from "./catalog.js";
import { select } from "./select.js";
import { renderFull } from "./render.js";

const START = "<!-- cue-skills:start -->";
const END = "<!-- cue-skills:end -->";

// Project files are untrusted territory: never follow a link, never leave the project.
// Returns the lstat of an existing regular target (or null); throws a refusal otherwise.
function check(f, realRoot) {
  let st = null;
  try { st = lstatSync(f); } catch (e) { if (e.code !== "ENOENT") throw new Error(`${f}: ${e.message}, refusing`); }
  if (st && !st.isFile()) throw new Error(`${f}: not a regular file, refusing`);
  // nearest existing ancestor of the parent must resolve inside the project (nothing is created before this)
  for (let d = dirname(f); ; d = dirname(d)) {
    try { lstatSync(d); } catch (e) { if (e.code === "ENOENT" && dirname(d) !== d) continue; throw new Error(`${f}: ${e.message}, refusing`); }
    const r = realpathSync(d);
    if (r !== realRoot && !r.startsWith(realRoot + sep)) throw new Error(`${f}: parent directory is outside the project, refusing`);
    return st;
  }
}

function write(f, text, st) {
  mkdirSync(dirname(f), { recursive: true });
  const bak = f + ".bak";
  if (st) {
    let has = true;
    try { lstatSync(bak); } catch { has = false; }
    if (!has) copyFileSync(f, bak, constants.COPYFILE_EXCL);
  }
  // exclusive tmp (never writes through a planted link), then rename over the regular target
  const tmp = `${f}.tmp-${process.pid}`;
  writeFileSync(tmp, text, { flag: "wx", mode: st ? st.mode & 0o777 : 0o644 });
  renameSync(tmp, f);
}

export function syncAgentsMd(cwd) {
  const root = projectRoot(cwd);
  const realRoot = realpathSync(root);
  const md = join(root, "AGENTS.md");
  const mdc = join(root, ".cursor/rules/cue-skills.mdc");
  const mdSt = check(md, realRoot);
  const cursor = (() => { try { return lstatSync(join(root, ".cursor")) && true; } catch { return false; } })();
  const mdcSt = cursor ? check(mdc, realRoot) : null;

  const rules = loadRules(cwd);
  const catalog = loadCatalog({ cwd, rules });
  const { selected } = select({ prompt: "", files: [], cwd, rules: { ...rules, when: [] }, catalog });
  const bodies = renderFull(selected.map((s) => s.entry), Infinity);
  const block = `${START}\n${bodies}${END}`;

  const old = mdSt ? readFileSync(md, "utf8") : "";
  const a = old.indexOf(START), b = old.indexOf(END, a);
  // unmatched START: replace to end of file
  const next = a >= 0 ? old.slice(0, a) + block + (b >= 0 ? old.slice(b + END.length) : "\n")
    : (old && !old.endsWith("\n") ? old + "\n" : old) + (old ? "\n" : "") + block + "\n";
  write(md, next, mdSt);

  const out = [`AGENTS.md: ${selected.length} skill(s) synced at ${md}`];
  if (cursor) {
    write(mdc, `---\ndescription: cue-skills active skills\nalwaysApply: true\n---\n${bodies}`, mdcSt);
    out.push(`Cursor rule written at ${mdc}`);
  }
  return out.join("\n");
}
