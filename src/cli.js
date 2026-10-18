// stub; real CLI lands in Task 8
import { readFileSync } from "node:fs";

export function main() {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  console.log(`cue-skills ${version}`);
}
