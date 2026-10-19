import test from "node:test";
import assert from "node:assert/strict";
import { retry } from "./retry.js";

test("returns the first success", async () => assert.equal(await retry(async () => 7), 7));
test("retries then succeeds", async () => {
  let n = 0;
  assert.equal(await retry(async () => { if (++n < 3) throw new Error("x"); return n; }, { delay: 1 }), 3);
});
test("throws the last error", async () => {
  await assert.rejects(retry(async (i) => { throw new Error("e" + i); }, { attempts: 2, delay: 1 }), /e1/);
});
test("maxDelay caps the wait", async () => {
  const t = Date.now();
  await assert.rejects(retry(async () => { throw new Error("x"); }, { attempts: 4, delay: 30, factor: 10, maxDelay: 30 }));
  assert.ok(Date.now() - t < 250, "waited too long");
});
test("shouldRetry false stops at once", async () => {
  let n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error("fatal"); }, { attempts: 5, delay: 1, shouldRetry: () => false }));
  assert.equal(n, 1);
});
