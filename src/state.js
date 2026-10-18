import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cueDir } from "./paths.js";

const dir = () => join(cueDir(), "state");
const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
const file = (agent, session) => join(dir(), `${clean(agent)}-${clean(session)}.json`);

export function loadState(agent, session) {
  try { return new Set(JSON.parse(readFileSync(file(agent, session), "utf8"))); }
  catch { return new Set(); }
}

export function saveState(agent, session, set) {
  mkdirSync(dir(), { recursive: true });
  const f = file(agent, session);
  const tmp = `${f}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify([...set]));
  renameSync(tmp, f);
  const cutoff = Date.now() - 7 * 864e5;
  for (const n of readdirSync(dir())) {
    try { if (statSync(join(dir(), n)).mtimeMs < cutoff) unlinkSync(join(dir(), n)); } catch { /* ignore */ }
  }
}

export function resetState(agent, session) {
  rmSync(file(agent, session), { force: true });
}
