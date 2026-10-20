// Freezes this machine's raw skill catalog into cards.json (home dir replaced by ~).
import { writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { buildCatalog, scanRoots } from "../../src/catalog.js";

const home = homedir();
const hide = (p) => (p.startsWith(home) ? "~" + p.slice(home.length) : p);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cards = buildCatalog(scanRoots({ cwd: tmpdir() }))
  .map(({ name, plugin, kind, version, description, when_to_use, tokens, invocable_only, path }) =>
    ({ name, plugin, kind, version, description: hide(description), when_to_use: hide(when_to_use), tokens, invocable_only, path: hide(path) }))
  .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.plugin ?? "", b.plugin ?? "") || cmp(a.name, b.name));
writeFileSync(new URL("./cards.json", import.meta.url), JSON.stringify(cards, null, 1) + "\n");
console.log(`${cards.length} cards`);
