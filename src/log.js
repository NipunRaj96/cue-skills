import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cueDir } from "./paths.js";

const file = () => join(cueDir(), "log.jsonl");

export function logEvent(obj) {
  try {
    mkdirSync(cueDir(), { recursive: true });
    appendFileSync(file(), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n");
  } catch { /* logging must never throw */ }
}

export function readLog(n = 20) {
  try {
    return readFileSync(file(), "utf8").split("\n").filter(Boolean).slice(-n).map((l) => JSON.parse(l));
  } catch { return []; }
}
