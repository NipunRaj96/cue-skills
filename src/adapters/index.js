import claude from "./claude.js";
import codex from "./codex.js";
import gemini from "./gemini.js";
import antigravity from "./antigravity.js";
import cursor from "./cursor.js";
import opencode from "./opencode.js";
import openclaw from "./openclaw.js";

export const adapters = [claude, codex, gemini, antigravity, cursor, opencode, openclaw];
export const get = (id) => adapters.find((a) => a.id === id);
