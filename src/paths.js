import { homedir } from "node:os";
import { existsSync, mkdirSync, chmodSync, statSync, lstatSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export const home = () => homedir();
export const cueDir = () => join(home(), ".cue");

// ~/.cue holds state, logs and trust decisions: owner-only.
export function ensureCueDir() {
  mkdirSync(cueDir(), { recursive: true, mode: 0o700 });
  chmodSync(cueDir(), 0o700);
}

export function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? join(home(), p.slice(1)) : p;
}

// a .git we may believe: owned by us, in a parent nobody else can write to
function trustedGit(d) {
  try {
    const uid = process.getuid?.();
    if (uid !== undefined && lstatSync(join(d, ".git")).uid !== uid) return false;
    return !(statSync(dirname(d)).mode & 0o002);
  } catch { return false; }
}

// Walks up from cwd, never into $HOME itself or above it.
export function projectRoot(cwd) {
  const stops = new Set([resolve(home())]);
  try { stops.add(realpathSync(home())); } catch { /* no home */ }
  for (let d = resolve(cwd); ; d = dirname(d)) {
    if (stops.has(d)) return cwd;
    if (existsSync(join(d, ".git")) && trustedGit(d)) return d;
    if (dirname(d) === d) return cwd;
  }
}
