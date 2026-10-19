import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache } from "./cache.js";

test("set and get", () => {
  const c = new Cache();
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("b"), undefined);
});

test("evicts the least recently used key", () => {
  const c = new Cache({ max: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.has("a"), false);
  assert.equal(c.size, 2);
});

test("get refreshes recency", () => {
  const c = new Cache({ max: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.has("a"), true);
  assert.equal(c.has("b"), false);
});

test("entries expire after ttlMs", () => {
  let t = 1000;
  const c = new Cache({ ttlMs: 50, now: () => t });
  c.set("a", 1);
  t += 49;
  assert.equal(c.get("a"), 1);
  t += 1;
  assert.equal(c.get("a"), undefined);
  assert.equal(c.size, 0);
});

test("delete removes a key", () => {
  const c = new Cache();
  c.set("a", 1);
  assert.equal(c.delete("a"), true);
  assert.equal(c.has("a"), false);
});
