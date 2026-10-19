import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.js";

test("simple rows", () => assert.deepEqual(parseCsv("a,b\nc,d"), [["a", "b"], ["c", "d"]]));
test("quoted commas", () => assert.deepEqual(parseCsv('a,"b,c"\n'), [["a", "b,c"]]));
test("escaped quotes", () => assert.deepEqual(parseCsv('"say ""hi"""'), [['say "hi"']]));
test("newline inside quotes", () => assert.deepEqual(parseCsv('"a\nb",c'), [["a\nb", "c"]]));
test("CRLF and empty fields", () => assert.deepEqual(parseCsv("a,,c\r\n,,\r\n"), [["a", "", "c"], ["", "", ""]]));
test("empty input", () => assert.deepEqual(parseCsv(""), []));
