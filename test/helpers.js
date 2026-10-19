import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "cue-sec-")));

// fresh HOME + a git project inside it
export function fixture() {
  const h = tmp();
  process.env.HOME = h;
  delete process.env.CUE_DISABLE;
  const cwd = join(h, "proj");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  return { h, cwd };
}

export function skill(dir, name, body = "body") {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n${body}\n`);
}

export function rules(file, text) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
}
