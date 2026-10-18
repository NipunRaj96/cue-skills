import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && !existsSync(path + ".bak")) copyFileSync(path, path + ".bak");
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, path);
}
