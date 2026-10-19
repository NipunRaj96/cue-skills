import test from "node:test";
import assert from "node:assert/strict";
import { wordFreq, topWords } from "./wordfreq.js";

test("counts case-insensitively", () => assert.deepEqual(wordFreq("a A b"), { a: 2, b: 1 }));
test("ignores extra whitespace", () => assert.deepEqual(wordFreq("  a   b\nb\t"), { a: 1, b: 2 }));
test("strips punctuation", () => assert.deepEqual(wordFreq("Hi, hi. HI!"), { hi: 3 }));
test("empty text", () => assert.deepEqual(wordFreq(""), {}));
test("topWords orders by count then alphabetically", () => assert.deepEqual(topWords("b a b c a b", 2), ["b", "a"]));
test("topWords ties are alphabetical", () => assert.deepEqual(topWords("z y x", 3), ["x", "y", "z"]));
