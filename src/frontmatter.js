import { parse } from "yaml";

const RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseSkill(text) {
  const m = RE.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = parse(m[1]);
  return { meta: meta && typeof meta === "object" ? meta : {}, body: text.slice(m[0].length) };
}
