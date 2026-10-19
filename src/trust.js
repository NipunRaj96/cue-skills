import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cueDir, ensureCueDir, projectRoot } from "./paths.js";
import { atomicWrite } from "./jsonfile.js";

const file = () => join(cueDir(), "trusted.json");
export const sha = (data) => createHash("sha256").update(data).digest("hex");
export const realRoot = (root) => { try { return realpathSync(root); } catch { return root; } };

export function readTrusted() {
  try {
    const d = JSON.parse(readFileSync(file(), "utf8"));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch { return {}; }
}

// Regular, size-capped, optionally self-owned file. {missing} | {error} | {data}
export function readRegular(path, max, owned = false) {
  let st;
  try { st = lstatSync(path); } catch (e) { return e.code === "ENOENT" ? { missing: true } : { error: `${path}: ${e.message}` }; }
  if (!st.isFile()) return { error: `${path}: not a regular file, ignored` };
  if (st.size > max) return { error: `${path}: larger than ${max / 1024} KB, ignored` };
  const uid = process.getuid?.();
  if (owned && uid !== undefined && st.uid !== uid) return { error: `${path}: owned by another user, ignored` };
  try { return { data: readFileSync(path) }; } catch (e) { return { error: `${path}: ${e.message}` }; }
}

export function trustCommand(cwd, revoke) {
  const root = projectRoot(cwd), key = realRoot(root);
  const map = readTrusted();
  ensureCueDir();
  if (revoke) {
    delete map[key];
    atomicWrite(file(), JSON.stringify(map, null, 2) + "\n", 0o600);
    return `revoked trust for ${key}`;
  }
  const r = readRegular(join(root, ".cue", "rules.yaml"), 64 * 1024, true);
  if (!r.data) throw new Error(r.error ?? `${join(root, ".cue/rules.yaml")}: not found, nothing to trust`);
  map[key] = sha(r.data);
  atomicWrite(file(), JSON.stringify(map, null, 2) + "\n", 0o600);
  return `trusted ${key} (sha256 ${map[key].slice(0, 12)}…)`;
}
