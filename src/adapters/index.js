import claude from "./claude.js";
import codex from "./codex.js";
import gemini from "./gemini.js";

export const adapters = [claude, codex, gemini];
export const get = (id) => adapters.find((a) => a.id === id);
