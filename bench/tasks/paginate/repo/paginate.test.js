import test from "node:test";
import assert from "node:assert/strict";
import { paginate } from "./paginate.js";

const xs = [1, 2, 3, 4, 5, 6, 7];
test("first page", () => assert.deepEqual(paginate(xs, 1, 3).items, [1, 2, 3]));
test("last partial page", () => assert.deepEqual(paginate(xs, 3, 3).items, [7]));
test("total pages rounds up", () => assert.equal(paginate(xs, 1, 3).totalPages, 3));
test("page past the end is empty", () => assert.deepEqual(paginate(xs, 4, 3).items, []));
test("empty list has zero pages", () => assert.equal(paginate([], 1, 3).totalPages, 0));
test("rejects a page below 1", () => assert.throws(() => paginate(xs, 0, 3), RangeError));
