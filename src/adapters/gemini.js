import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { home } from "../paths.js";
import { jsonAdapter } from "./hooksjson.js";
import { start, prompt } from "./claude.js";

function detect() {
  if (existsSync(join(home(), ".gemini/settings.json"))) return true;
  try { execFileSync("which", ["gemini"], { stdio: "ignore" }); return true; } catch { return false; }
}

export default jsonAdapter({
  id: "gemini", label: "Gemini CLI", status: "experimental", dir: ".gemini", fileName: "settings.json",
  spec: [
    { event: "SessionStart", timeout: 5000 },
    { event: "BeforeAgent", timeout: 5000 },
  ],
  map: { SessionStart: start, BeforeAgent: prompt },
  detect,
});
