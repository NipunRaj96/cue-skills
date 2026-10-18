import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export const home = () => homedir();
export const cueDir = () => join(home(), ".cue");

export function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? join(home(), p.slice(1)) : p;
}

export function projectRoot(cwd) {
  for (let d = resolve(cwd); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return d;
    if (dirname(d) === d) return cwd;
  }
}
