import claude from "./claude.js";
import codex from "./codex.js";
import gemini from "./gemini.js";
import { antigravityCli, antigravityApp } from "./antigravity.js";
import cursor from "./cursor.js";

export const adapters = [claude, codex, gemini, antigravityCli, antigravityApp, cursor];
export const get = (id) => adapters.find((a) => a.id === id);
