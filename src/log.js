import { appendFileSync, readFileSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";
import { cueDir, ensureCueDir } from "./paths.js";

const file = () => join(cueDir(), "log.jsonl");

export function logEvent(obj) {
  try {
    ensureCueDir();
    try { if (statSync(file()).size > 5 * 1024 * 1024) renameSync(file(), file() + ".1"); } catch { /* no log yet */ }
    appendFileSync(file(), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n", { mode: 0o600 });
  } catch { /* logging must never throw */ }
}

export function readLog(n = 20) {
  try {
    return readFileSync(file(), "utf8").split("\n").filter(Boolean).slice(-n).map((l) => JSON.parse(l));
  } catch { return []; }
}
