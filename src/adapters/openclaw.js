import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { cueDir } from "../paths.js";

const SRC = fileURLToPath(new URL("../../plugins/openclaw/", import.meta.url));
const ENGINE = pathToFileURL(fileURLToPath(new URL("../engine.js", import.meta.url))).href;
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const copyDir = () => join(cueDir(), "openclaw-plugin");
const bin = () => process.env.CUE_OPENCLAW_BIN || "openclaw";
const onPath = () => (process.env.PATH || "").split(delimiter).some((d) => d && existsSync(join(d, "openclaw")));

export default {
  id: "openclaw", label: "OpenClaw", status: "tested",
  detect: () => !!process.env.CUE_OPENCLAW_BIN || onPath(),
  isInstalled: () => existsSync(join(copyDir(), "index.js")),
  // `cmd` unused: no CLI hook. exec injectable for tests.
  install(_cmd, { exec = execFileSync } = {}) {
    const dir = copyDir();
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(SRC))
      writeFileSync(join(dir, f), readFileSync(join(SRC, f), "utf8").split("__CUE_ENGINE__").join(ENGINE).split("__CUE_VERSION__").join(VERSION));
    exec(bin(), ["plugins", "install", dir], { stdio: "ignore" });
    return `OpenClaw: plugin installed from ${dir} (no extra config flags needed).`;
  },
  uninstall(_cmd, { exec = execFileSync } = {}) {
    let warn = "";
    try { exec(bin(), ["plugins", "uninstall", "cue-skills", "--force"], { stdio: "ignore" }); }
    catch (e) { warn = ` warning: openclaw uninstall failed: ${e.message}`; }
    rmSync(copyDir(), { recursive: true, force: true });
    return `OpenClaw: plugin files removed.${warn}`;
  },
  handle: () => "",
};
