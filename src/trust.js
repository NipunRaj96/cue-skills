import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cueDir, ensureCueDir, projectRoot } from "./paths.js";
import { atomicWrite } from "./jsonfile.js";
import { readChecked } from "./safefile.js";

const file = () => join(cueDir(), "trusted.json");
export const sha = (data) => createHash("sha256").update(data).digest("hex");
export const realRoot = (root) => { try { return realpathSync(root); } catch { return root; } };

export function readTrusted() {
  try {
    const d = JSON.parse(readFileSync(file(), "utf8"));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch { return {}; }
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
  const r = readChecked(join(root, ".cue", "rules.yaml"), 64 * 1024, { base: root, nofollow: true, owned: true });
  if (!r.data) throw new Error(r.error ?? `${join(root, ".cue/rules.yaml")}: not found, nothing to trust`);
  map[key] = sha(r.data);
  atomicWrite(file(), JSON.stringify(map, null, 2) + "\n", 0o600);
  return `trusted ${key} (sha256 ${map[key].slice(0, 12)}…)`;
}
