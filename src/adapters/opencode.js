import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { home } from "../paths.js";

const SRC = fileURLToPath(new URL("../../plugins/opencode/cue-skills.js", import.meta.url));
const ENGINE = pathToFileURL(fileURLToPath(new URL("../engine.js", import.meta.url))).href;
const target = () => join(home(), ".config/opencode/plugins/cue-skills.js");

export default {
  id: "opencode", label: "OpenCode", status: "experimental",
  detect: () => existsSync(join(home(), ".config/opencode")),
  isInstalled: () => existsSync(target()),
  install() {
    mkdirSync(dirname(target()), { recursive: true });
    writeFileSync(target(), readFileSync(SRC, "utf8").split("__CUE_ENGINE__").join(ENGINE));
    return `OpenCode: plugin installed at ${target()}.`;
  },
  uninstall() {
    rmSync(target(), { force: true });
    return `OpenCode: plugin removed from ${target()}.`;
  },
  handle: () => "",
};
