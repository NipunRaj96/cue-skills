import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.js";
import { loadRules } from "../src/rules.js";
import { scanRoots, buildCatalog, collapse, entryId } from "../src/catalog.js";

test("cards carry when_to_use, tokens, invocable_only, version", () => {
  const { h, cwd } = fixture();
  const d = join(h, ".claude/plugins/cache/m/p/1.2.0/skills/x");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "SKILL.md"), "---\nname: x\ndescription: d\ntriggers: [a b, c]\ndisable-model-invocation: true\n---\n" + "y".repeat(400));
  const e = buildCatalog(scanRoots({ cwd, rules: loadRules(cwd) })).find((e) => e.name === "x");
  assert.equal(e.when_to_use, "a b, c");
  assert.equal(e.tokens, 100);
  assert.equal(e.invocable_only, true);
  assert.equal(e.version, "1.2.0");
});
test("collapse: user > project > plugin; newest plugin version, then plugin name", () => {
  const E = (kind, plugin, version, path) => ({ name: "s", kind, plugin, version, path });
  assert.equal(collapse([E("plugin", "a", "2.0.0", "/1"), E("user", null, null, "/2")])[0].kind, "user");
  assert.equal(collapse([E("plugin", "a", "2.0.0", "/1"), E("project", null, null, "/2")])[0].kind, "project");
  assert.equal(collapse([E("plugin", "b", "1.0.0", "/1"), E("plugin", "a", "1.10.0", "/2")])[0].plugin, "a");
  assert.equal(collapse([E("plugin", "b", "1.0.0", "/1"), E("plugin", "a", "1.0.0", "/2")])[0].plugin, "a");
  assert.equal(collapse([E("user", null, null, "/b"), E("user", null, null, "/a")])[0].path, "/a");
  assert.equal(collapse([{ name: "z", kind: "user", path: "/z" }, ...[E("user", null, null, "/s")]]).map((e) => e.name).join(), "s,z");
});
test("entryId", () => {
  assert.equal(entryId({ name: "n", plugin: "p" }), "p:n");
  assert.equal(entryId({ name: "n", plugin: null }), "n");
});
