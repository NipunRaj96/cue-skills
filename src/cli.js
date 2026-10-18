import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapters } from "./adapters/index.js";
import { runHook } from "./hook.js";
import { cueDir, home, expandHome } from "./paths.js";
import { loadRules } from "./rules.js";
import { loadCatalog, scanRoots } from "./catalog.js";
import { select } from "./select.js";
import { readLog } from "./log.js";
import { syncAgentsMd } from "./sync.js";

const pkg = () => JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const USAGE = "usage: cue-skills <init [--only id,id] | uninstall | scan | list | status | why [-n N] | sync | --version>";
const BIN = fileURLToPath(new URL("../bin/cue-skills.js", import.meta.url));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const say = console.log;

function stale(a) {
  const f = { opencode: join(home(), ".config/opencode/plugins/cue-skills.js"), openclaw: join(cueDir(), "openclaw-plugin/index.js") }[a.id];
  if (!f) return "-";
  if (!a.isInstalled()) return "-";
  try {
    const m = readFileSync(f, "utf8").match(/file:\/\/[^"'`\s)]+/);
    return m && !existsSync(fileURLToPath(m[0])) ? "yes" : "no";
  } catch { return "no"; }
}

// run fn on each adapter; print ✓/✗; exitCode 1 on any failure
function each(list, fn) {
  for (const a of list) {
    try { say(`✓ ${a.label}${fn.showStatus ? ` (${a.status})` : ""}: ${fn(a)}`); }
    catch (e) { say(`✗ ${a.label}: ${e.message}`); process.exitCode = 1; }
  }
}

function init(args) {
  const real = realpathSync(BIN);
  if (real.includes("/_npx/")) {
    say("Running from npx cache. Install first: npm i -g cue-skills, then run cue-skills init.");
    process.exitCode = 1;
    return;
  }
  let list = adapters;
  const i = args.indexOf("--only");
  if (i >= 0) {
    const ids = (args[i + 1] || "").split(",").filter(Boolean);
    const bad = ids.filter((id) => !adapters.some((a) => a.id === id));
    if (bad.length || !ids.length) {
      say(`unknown adapter: ${bad.join(",") || "(none given)"}. Known: ${adapters.map((a) => a.id).join(", ")}`);
      process.exitCode = 1;
      return;
    }
    list = adapters.filter((a) => ids.includes(a.id));
  }
  const rules = join(cueDir(), "rules.yaml");
  if (!existsSync(rules)) {
    mkdirSync(cueDir(), { recursive: true });
    copyFileSync(new URL("../templates/rules.yaml", import.meta.url), rules);
    say(`Created ${rules}`);
  }
  const cmd = `"${process.execPath}" "${real}" hook`;
  const install = (a) => a.install(`${cmd} ${a.id}`);
  install.showStatus = true;
  each(list.filter((a) => a.detect()), install);
}

function status() {
  const cwd = process.cwd();
  const rules = loadRules(cwd);
  say(`rules: ${join(cueDir(), "rules.yaml")}, ${join(cwd, ".cue/rules.yaml")} (project root)`);
  for (const e of rules.errors) say(`rule error: ${e}`);
  const catalog = loadCatalog({ cwd, extraDirs: rules.skillDirs.map(expandHome) });
  const { selected, unresolved } = select({ prompt: "", files: [], cwd, rules, catalog });
  say("active skills:");
  for (const s of selected) say(`  ${s.entry.name}  (${s.reason})`);
  if (!selected.length) say("  (none)");
  if (unresolved.length) say(`unresolved: ${unresolved.join(", ")}`);
  say("agent  detected  installed  status  stale");
  for (const a of adapters)
    say([a.label, a.detect() ? "yes" : "no", a.isInstalled() ? "yes" : "no", a.status, stale(a)].join("  "));
}

export async function main(argv) {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case "init": init(args); break;
      case "uninstall": each(adapters.filter((a) => a.isInstalled()), (a) => a.uninstall()); break;
      case "scan": {
        rmSync(join(cueDir(), "catalog.json"), { force: true });
        const cwd = process.cwd();
        const rules = loadRules(cwd);
        const extraDirs = rules.skillDirs.map(expandHome);
        const c = loadCatalog({ cwd, extraDirs });
        say(`${c.length} skills`);
        for (const { root } of scanRoots({ cwd, extraDirs }))
          say(`  ${root}: ${c.filter((e) => e.path.startsWith(root + "/")).length}`);
        break;
      }
      case "list": {
        const cwd = process.cwd();
        const c = loadCatalog({ cwd, extraDirs: loadRules(cwd).skillDirs.map(expandHome) });
        for (const e of c) say(`${e.name}  [${e.plugin ?? "-"}]  ${cut(e.description.replace(/\s+/g, " "), 60)}`);
        break;
      }
      case "status": status(); break;
      case "why": {
        const i = args.indexOf("-n");
        const n = i >= 0 ? parseInt(args[i + 1], 10) || 20 : 20;
        for (const l of readLog(n))
          say(`${l.ts} ${l.agent} ${l.event} ${(l.skills || []).map((s) => (typeof s === "string" ? s : `${s.name}:${s.reason}`)).join(",")} ${l.chars ?? ""}`.trimEnd());
        break;
      }
      case "sync": say(syncAgentsMd(process.cwd())); break;
      case "hook": {
        try {
          let input = "";
          try { input = readFileSync(0, "utf8"); } catch { /* no stdin */ }
          process.stdout.write(runHook(args[0], args[1], input));
        } catch { /* fail open */ }
        process.exitCode = 0;
        break;
      }
      case "--version": case "-v": say(pkg().version); break;
      default: say(USAGE);
    }
  } catch (e) {
    if (cmd === "hook") return;
    console.error(e.message);
    process.exitCode = 1;
  }
}
