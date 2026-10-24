import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cueDir, ensureCueDir } from "./paths.js";

const dir = () => join(cueDir(), "state");
const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
const file = (agent, session) => join(dir(), `${clean(agent)}-${clean(session)}.json`);

// Session file: {seen: [skill ids injected], drift: {skill: reason}, turns: prompt count}.
// v0.1 wrote a bare array of ids; it still loads as {seen}.
export function loadSession(agent, session) {
  let d = null;
  try { d = JSON.parse(readFileSync(file(agent, session), "utf8")); } catch { /* none yet */ }
  if (Array.isArray(d)) d = { seen: d };
  const drift = {};
  if (d?.drift && typeof d.drift === "object" && !Array.isArray(d.drift))
    for (const [k, v] of Object.entries(d.drift)) if (typeof v === "string") drift[k] = v;
  return { seen: new Set(Array.isArray(d?.seen) ? d.seen : []), drift, turns: Number.isInteger(d?.turns) && d.turns > 0 ? d.turns : 0 };
}

export function saveSession(agent, session, { seen, drift, turns }) {
  ensureCueDir();
  mkdirSync(dir(), { recursive: true });
  const f = file(agent, session);
  const tmp = `${f}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ seen: [...seen], drift, turns }), { mode: 0o600 });
  renameSync(tmp, f);
  const cutoff = Date.now() - 7 * 864e5;
  for (const n of readdirSync(dir())) {
    try { if (statSync(join(dir(), n)).mtimeMs < cutoff) unlinkSync(join(dir(), n)); } catch { /* ignore */ }
  }
}

export const loadState = (agent, session) => loadSession(agent, session).seen;
export const saveState = (agent, session, seen) => saveSession(agent, session, { ...loadSession(agent, session), seen });

// compact/clear: forget what was injected and the turn count, keep pending drift
export function resetState(agent, session) {
  const { drift } = loadSession(agent, session);
  if (Object.keys(drift).length) saveSession(agent, session, { seen: new Set(), drift, turns: 0 });
  else rmSync(file(agent, session), { force: true });
}
