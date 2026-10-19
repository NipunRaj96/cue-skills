#!/usr/bin/env node
// Cue benchmark harness. Sequential: ~/.cue/rules.yaml is global. See bench/README.md.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { loadCatalog, resolve } from "../src/catalog.js";
import { parseSkill } from "../src/frontmatter.js";
import { AGENTS, ROOT } from "./agents.js";
import { turnMetrics, locFromNumstat } from "./metrics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODES = ["none", "manual", "cue"];
const RULES = join(homedir(), ".cue", "rules.yaml");
const RULES_BAK = join(ROOT, "rules.yaml.bak");
const RULES_BY_MODE = { none: "# bench: no rules\n", manual: "# bench: no rules\n", cue: "always: [caveman, ponytail]\n" };
const FAILS_BEFORE_SKIP = 3;

// ---- resume logic (pure) ----
export const sessionKey = (r) => [r.agent, r.mode, r.task, r.repeat].join("|");

// A session is done when it has turns 1..n, none with an error. Anything else is rerun from turn 1,
// because a half-finished agent session cannot be reattached reliably.
export function completeSessions(rows, nTurns) {
  const by = new Map();
  for (const r of rows) (by.get(sessionKey(r)) ?? by.set(sessionKey(r), []).get(sessionKey(r))).push(r);
  const done = new Set();
  for (const [k, rs] of by) {
    const ok = new Set(rs.filter((r) => !r.error).map((r) => r.turn));
    if (rs.every((r) => !r.error) && Array.from({ length: nTurns }, (_, i) => i + 1).every((t) => ok.has(t))) done.add(k);
  }
  return done;
}
export const pruneIncomplete = (rows, done) => rows.filter((r) => done.has(sessionKey(r)));

export const readRows = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

// ---- summary (pure) ----
const mean = (xs) => { xs = xs.filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
const f = (x, d = 2) => (x == null ? "-" : x.toFixed(d));

export function summarize(rows, nTurns = 4) {
  const out = ["# Cue benchmark summary", ""];
  const agents = [...new Set(rows.map((r) => r.agent))];
  for (const a of agents) {
    const ar = rows.filter((r) => r.agent === a);
    const stat = (m) => {
      const mr = ar.filter((r) => r.mode === m && !r.error);
      const sess = new Set(mr.map(sessionKey));
      const t = (n, k) => mean(mr.filter((r) => r.turn === n).map((r) => r[k]));
      const fin = mr.filter((r) => r.turn === nTurns && r.tests_pass != null);
      return {
        n: sess.size, tok1: t(1, "out_tokens"), tokN: t(nTurns, "out_tokens"), tokAll: mean(mr.map((r) => r.out_tokens)),
        cs1: t(1, "caveman_score"), csN: t(nTurns, "caveman_score"),
        loc: mean(mr.map((r) => r.loc_added)), pass: fin.length ? fin.filter((r) => r.tests_pass).length / fin.length : null, est: mr.some((r) => r.estimated),
      };
    };
    const s = Object.fromEntries(MODES.map((m) => [m, stat(m)]));
    out.push(`## ${a}`, "",
      `| mode | n | out_tokens t1 | out_tokens t${nTurns} | caveman t1 | caveman t${nTurns} | drift (cs t${nTurns}-t1) | mean loc_added | tests pass | tokens vs none |`,
      "|---|---|---|---|---|---|---|---|---|---|");
    for (const m of MODES) {
      const x = s[m];
      if (!x.n) continue;
      const vs = m !== "none" && s.none.tokAll ? `${(((x.tokAll - s.none.tokAll) / s.none.tokAll) * 100).toFixed(1)}%` : "-";
      out.push(`| ${m}${x.est ? " (est)" : ""} | ${x.n} | ${f(x.tok1, 1)} | ${f(x.tokN, 1)} | ${f(x.cs1, 3)} | ${f(x.csN, 3)} | ${x.cs1 != null && x.csN != null ? f(x.csN - x.cs1, 3) : "-"} | ${f(x.loc, 1)} | ${x.pass == null ? "-" : (x.pass * 100).toFixed(0) + "%"} | ${vs} |`);
    }
    const skipped = [...new Set(ar.filter((r) => r.skipped).map((r) => `${r.mode}: ${r.skipped}`))];
    const errs = ar.filter((r) => r.error && !r.skipped).length;
    if (skipped.length) out.push("", `Skipped: ${skipped.join("; ")}`);
    if (errs) out.push("", `Errored turns: ${errs}`);
    out.push("");
  }
  return out.join("\n");
}

// ---- rules.yaml safety ----
function backupRules() {
  mkdirSync(ROOT, { recursive: true });
  if (existsSync(RULES_BAK)) { // a crashed earlier run left the bench rules in place
    console.error("restoring rules.yaml from a stale backup");
    restoreRules();
  }
  if (existsSync(RULES)) copyFileSync(RULES, RULES_BAK);
  else writeFileSync(RULES_BAK + ".absent", "");
}
function restoreRules() {
  try {
    if (existsSync(RULES_BAK)) { copyFileSync(RULES_BAK, RULES); rmSync(RULES_BAK); }
    else if (existsSync(RULES_BAK + ".absent")) { rmSync(RULES, { force: true }); rmSync(RULES_BAK + ".absent"); }
  } catch (e) { console.error("FAILED to restore rules.yaml:", e.message); }
}

// ---- helpers ----
const git = (cwd, ...a) => spawnSync("git", ["-c", "user.name=bench", "-c", "user.email=bench@localhost", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" });

function skillBodies() {
  const catalog = loadCatalog({ cwd: process.cwd(), rules: {} });
  return ["caveman", "ponytail"].map((n) => {
    const e = resolve(catalog, n);
    if (!e) throw new Error(`skill "${n}" not found in the Cue catalog`);
    return parseSkill(readFileSync(e.path, "utf8")).body.trim();
  });
}

function parseArgs(argv) {
  const o = { agents: Object.keys(AGENTS), modes: MODES, tasks: null, repeats: 1, out: null, turns: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--agents") o.agents = v.split(","), i++;
    else if (k === "--modes") o.modes = v.split(","), i++;
    else if (k === "--tasks") o.tasks = v.split(","), i++;
    else if (k === "--repeats") o.repeats = parseInt(v, 10), i++;
    else if (k === "--out") o.out = v, i++;
    else if (k === "--turns") o.turns = parseInt(v, 10), i++; // smoke runs: cap turns per session
    else throw new Error(`unknown option ${k}`);
  }
  for (const a of o.agents) if (!AGENTS[a]) throw new Error(`unknown agent ${a}; known: ${Object.keys(AGENTS).join(", ")}`);
  for (const m of o.modes) if (!MODES.includes(m)) throw new Error(`unknown mode ${m}`);
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const allTasks = readdirSync(join(HERE, "tasks"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const tasks = o.tasks ?? allTasks;
  for (const t of tasks) if (!allTasks.includes(t)) throw new Error(`unknown task ${t}; known: ${allTasks.join(", ")}`);
  const out = o.out ?? join(HERE, "results", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(out, { recursive: true });
  const runsFile = join(out, "runs.jsonl");
  const def = Object.fromEntries(tasks.map((t) => [t, JSON.parse(readFileSync(join(HERE, "tasks", t, "task.json"), "utf8")).turns]));
  const nOf = (t) => Math.min(def[t].length, o.turns ?? Infinity);

  const rows0 = readRows(runsFile);
  const done = new Set();
  for (const t of tasks) for (const k of completeSessions(rows0.filter((r) => r.task === t), nOf(t))) done.add(k);
  const keep = pruneIncomplete(rows0, done);
  if (keep.length !== rows0.length) writeFileSync(runsFile, keep.map((r) => JSON.stringify(r) + "\n").join(""));
  const log = (r) => appendFileSync(runsFile, JSON.stringify(r) + "\n");

  const bodies = o.modes.includes("manual") ? skillBodies() : null;
  const manualHeader = bodies && `Follow these skills for this whole session:\n\n${bodies.join("\n\n---\n\n")}\n\n`;

  backupRules();
  let stopping = false;
  const bye = () => { stopping = true; restoreRules(); process.exit(130); };
  process.on("SIGINT", bye); process.on("SIGTERM", bye);

  const fails = {}, skipAgent = {};
  try {
    for (const agent of o.agents) {
      const A = AGENTS[agent];
      for (const mode of o.modes) for (const task of tasks) for (let repeat = 1; repeat <= o.repeats; repeat++) {
        const base = { agent, mode, task, repeat };
        if (done.has(sessionKey(base))) continue;
        const why = A.skipModes?.[mode] ?? skipAgent[agent];
        if (why) {
          log({ ...base, turn: 0, skipped: why, error: why });
          continue;
        }
        writeFileSync(RULES, RULES_BY_MODE[mode]);
        const runDir = join(ROOT, `${agent}-${mode}-${task}-${repeat}-${Date.now()}`);
        mkdirSync(runDir, { recursive: true });
        cpSync(join(HERE, "tasks", task, "repo"), runDir, { recursive: true });
        git(runDir, "init", "-q"); git(runDir, "add", "-A"); git(runDir, "commit", "-qm", "base");
        const sess = await A.open(runDir, mode);
        const n = nOf(task);
        for (let turn = 1; turn <= n && !stopping; turn++) {
          let prompt = def[task][turn - 1];
          if (mode === "manual" && turn === 1) prompt = manualHeader + prompt;
          const t0 = Date.now();
          const res = await A.turn(sess, runDir, prompt);
          const ms = Date.now() - t0;
          git(runDir, "add", "-A");
          const loc_added = locFromNumstat(git(runDir, "diff", "--cached", "--numstat", "--", "*.js").stdout);
          git(runDir, "commit", "-qm", `turn ${turn}`);
          const row = { ...base, turn, ...turnMetrics(res.text, res.usageOut, res.steps), loc_added, ms };
          if (turn === def[task].length) row.tests_pass = !res.error && spawnSync("node", ["--test"], { cwd: runDir, timeout: 60000 }).status === 0;
          if (res.error) row.error = res.error;
          log(row);
          console.log(`${agent} ${mode} ${task} #${repeat} t${turn}: ${row.out_tokens}${row.estimated ? "~" : ""} tok, ${ms} ms${row.error ? `, ERROR ${row.error}` : ""}`);
          fails[agent] = res.error ? (fails[agent] ?? 0) + 1 : 0;
          if (fails[agent] >= FAILS_BEFORE_SKIP) {
            skipAgent[agent] = `skipped: ${FAILS_BEFORE_SKIP} consecutive failures (last: ${res.error})`;
            console.error(`${agent}: ${skipAgent[agent]}`);
          }
          if (res.error) break;
        }
      }
    }
  } finally {
    restoreRules();
    for (const a of o.agents) AGENTS[a].finish?.();
    writeFileSync(join(out, "summary.md"), summarize(readRows(runsFile)));
    console.log(`results: ${out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
