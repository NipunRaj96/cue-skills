// Callers normalise "\" to "/" before testing.
export function globToRegExp(glob) {
  if (glob.length > 256) throw new Error("glob longer than 256 characters");
  glob = glob.replace(/\*{3,}/g, "**");
  if ((glob.match(/\*\*|\*|\?/g) || []).length > 10) throw new Error("glob has more than 10 wildcards");
  // each star is a backtracking point (n^k): 10 of them still take seconds on a 40-char path
  if ((glob.match(/\*+/g) || []).length > 4) throw new Error("glob has more than 4 star wildcards");
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
