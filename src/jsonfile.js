import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync, realpathSync, statSync } from "node:fs";
import { dirname } from "node:path";

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, data, mode) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && !existsSync(path + ".bak")) copyFileSync(path, path + ".bak");
  atomicWrite(path, JSON.stringify(data, null, 2) + "\n", mode);
}

// ONLY for files the user owns outright (agent configs in $HOME, ~/.cue): follows the
// user's own dotfile symlinks. Project files go through sync.js, which never follows links.
// tmp next to the real path (symlinks kept), original mode kept unless `mode` is given
export function atomicWrite(path, text, mode) {
  const real = existsSync(path) ? realpathSync(path) : path;
  const tmp = `${real}.tmp-${process.pid}`;
  writeFileSync(tmp, text, mode !== undefined ? { mode } : existsSync(real) ? { mode: statSync(real).mode & 0o777 } : undefined);
  renameSync(tmp, real);
}
