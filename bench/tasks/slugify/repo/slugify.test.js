import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slugify.js";

test("lowercases and hyphenates", () => assert.equal(slugify("Hello World"), "hello-world"));
test("strips punctuation", () => assert.equal(slugify("Hi, there! It's 5pm."), "hi-there-its-5pm"));
test("collapses separators and trims", () => assert.equal(slugify("  a -- b  "), "a-b"));
test("removes accents", () => assert.equal(slugify("Crème Brûlée"), "creme-brulee"));
test("maxLength cuts at a hyphen boundary", () => assert.equal(slugify("one two three four", { maxLength: 11 }), "one-two"));
