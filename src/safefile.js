import { openSync, fstatSync, readFileSync, closeSync, realpathSync, constants } from "node:fs";
import { sep } from "node:path";

// The one reader for files a project (or the user) controls. Checks and read share one fd,
// so a swap between check and read cannot redirect us.
// opts: base (project root: path must resolve inside it, single hard link), nofollow, owned.
// Returns {data: string} | {missing: true} | {error: string}
export function readChecked(path, maxBytes, { base, nofollow = false, owned = false } = {}) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (nofollow ? constants.O_NOFOLLOW ?? 0 : 0));
  } catch (e) {
    if (e.code === "ENOENT") return { missing: true };
    return { error: `${path}: ${e.code === "ELOOP" ? "not a regular file" : e.message}, ignored` };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { error: `${path}: not a regular file, ignored` };
    if (st.size > maxBytes) return { error: `${path}: larger than ${maxBytes / 1024} KB, ignored` };
    const uid = process.getuid?.();
    if (owned && uid !== undefined && st.uid !== uid) return { error: `${path}: owned by another user, ignored` };
    if (base) {
      if (st.nlink !== 1) return { error: `${path}: hard-linked file, ignored` };
      const rb = realpathSync(base), rp = realpathSync(path);
      if (!rp.startsWith(rb + sep)) return { error: `${path}: resolves outside the project, ignored` };
    }
    return { data: readFileSync(fd, "utf8") };
  } catch (e) {
    return { error: `${path}: ${e.message}` };
  } finally { closeSync(fd); }
}

export const readRegular = (path, maxBytes, opts) => readChecked(path, maxBytes, opts).data ?? null;
