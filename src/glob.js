// Linear-ish glob matcher (no regex, no catastrophic backtracking). Callers normalise "\\" to "/".
// "**" as a whole segment matches zero or more segments; "*" and "?" never cross "/".
const MAX_PATTERN = 256, MAX_PATH = 1024;

// one segment: classic star-backtrack, only the last star ever retries
function seg(p, s) {
  let pi = 0, si = 0, star = -1, mark = 0;
  while (si < s.length) {
    if (p[pi] === "*") { star = pi++; mark = si; }
    else if (pi < p.length && (p[pi] === "?" || p[pi] === s[si])) { pi++; si++; }
    else if (star >= 0) { pi = star + 1; si = ++mark; }
    else return false;
  }
  while (p[pi] === "*") pi++;
  return pi === p.length;
}

export function matchGlob(pattern, path) {
  if (pattern.length > MAX_PATTERN) throw new Error("glob longer than 256 characters");
  if (path.length > MAX_PATH) return false;
  const P = pattern.split("/"), S = path.split("/");
  let pi = 0, si = 0, star = -1, mark = 0;
  while (si < S.length) {
    if (P[pi] === "**") { star = pi++; mark = si; }
    else if (pi < P.length && seg(P[pi], S[si])) { pi++; si++; }
    else if (star >= 0) { pi = star + 1; si = ++mark; }
    else return false;
  }
  while (P[pi] === "**") pi++;
  return pi === P.length;
}

export const globToRegExp = (glob) => {
  if (glob.length > MAX_PATTERN) throw new Error("glob longer than 256 characters");
  return { test: (path) => matchGlob(glob, path) };
};
