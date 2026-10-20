import { lstatSync } from "node:fs";
import { join } from "node:path";
import { readChecked } from "./safefile.js";

// First match wins the label; every match adds its words.
export const EXPAND = [
  { file: /\.(tsx|jsx|css|scss|sass|less|html|vue|svelte)$/i, words: "frontend ui", label: "frontend file" },
  { tool: /^mcp__stitch__|figma/i, words: "design ui replicate", label: "design task" },
  { file: /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/, words: "testing debug", label: "test file" },
  { tool: /^mcp__.*(playwright|chrome|browser)/i, words: "browser testing", label: "browser tool" },
  { file: /(^|\/)SKILL\.md$/, words: "skill create write", label: "skill file" },
  { file: /\.(apk|xapk|aar|jar|dex)$/i, words: "android decompile reverse engineer", label: "android package" },
  { file: /(^|\/)\.github\/workflows\/|(^|\/)Dockerfile$/, words: "ci deploy", label: "ci config" },
  { file: /\.sql$|(^|\/)migrations?\//i, words: "database migration", label: "migration" },
  { file: /(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$/, words: "compress memory context", label: "memory file" },
  { file: /(^|\/)PLAN\.md$|(^|\/)(plans?|specs?)\//i, words: "plan implementation execute", label: "plan file" },
  { file: /\.(codex|claude)-plugin\/|(^|\/)(plugin|marketplace)\.json$/, words: "plugin manifest scaffold", label: "plugin manifest" },
  { file: /(^|\/)(i18n|locales?|translations?)\/|\.(po|arb)$/i, words: "copy wording microcopy", label: "copy file" },
  { file: /(^|\/)(design|tokens?)\/|tokens?\.(json|css|ts)$/i, words: "design system tokens", label: "design tokens" },
  { file: /(^|\/)(theme|colou?rs?|palette)[^/]*\.[a-z]+$/i, words: "color palette theme", label: "color file" },
  { file: /gsap|scrolltrigger|(^|\/)(animations?|motion|transitions?)(\/|[^/]*\.[a-z]+$)/i, words: "animation motion scroll", label: "animation file" },
  { file: /auth0|(^|\/)(auth|login|oauth|jwt)[^/]*\.[a-z]+$/i, words: "auth authentication login", label: "auth file" },
  { tool: /screenshot|snapshot/i, words: "visual design review ui", label: "screenshot" },
  { tool: /press_key|keyboard/i, words: "keyboard accessibility focus", label: "keyboard" },
  { file: /\.(png|jpe?g|webp|svg)$/i, words: "image", label: "image file" },
];

export function queryParts({ prompt = "", tool = "", file = "", failure = false, project = "" } = {}) {
  const parts = [];
  if (prompt) parts.push({ text: prompt, weight: 1 });
  const hits = EXPAND.filter((e) => (e.tool && tool && e.tool.test(tool)) || (e.file && file && e.file.test(file)));
  for (const e of hits) parts.push({ text: e.words, weight: 1 });
  if (tool.startsWith("mcp__")) parts.push({ text: tool.replace(/^mcp__/, "").replace(/_+/g, " "), weight: 1 });
  if (failure) parts.push({ text: "testing debug failure", weight: 1 });
  if (project) parts.push({ text: project, weight: 0.5 });
  const label = failure ? "test failure" : hits[0]?.label ?? (prompt ? "prompt" : "tool");
  return { parts, label };
}

const RUNNER = /\b(npm (run )?test|pnpm test|yarn test|npx (jest|vitest|mocha)|jest|vitest|mocha|pytest|go test|cargo test|node --test|rspec|phpunit|dotnet test|mvn test|gradle test)\b/;
const FAILED = /\b\d+ (failed|failing)\b|^FAIL\b|^not ok \d+|AssertionError|✗|✖|\bFAILED\b|Tests? failed/m;
export const testFailure = ({ command = "", output = "", exitCode = null } = {}) =>
  RUNNER.test(command) && exitCode !== 0 && FAILED.test(output);

export const DEP_WORDS = {
  ...Object.fromEntries(["react", "react-dom", "react-native", "expo", "next", "vue", "nuxt", "svelte", "@sveltejs/kit", "@angular/core", "solid-js", "astro"].map((d) => [d, "frontend ui"])),
  ...Object.fromEntries(["tailwindcss", "styled-components", "@emotion/react", "sass"].map((d) => [d, "frontend"])),
  ...Object.fromEntries(["framer-motion", "motion", "gsap"].map((d) => [d, "animation motion"])),
  ...Object.fromEntries(["three", "@react-three/fiber"].map((d) => [d, "3d webgl"])),
  ...Object.fromEntries(["express", "fastify", "koa", "hono"].map((d) => [d, "server api"])),
  ...Object.fromEntries(["jest", "vitest", "mocha", "@playwright/test", "cypress"].map((d) => [d, "testing"])),
  ...Object.fromEntries(["auth0", "@auth0/nextjs-auth0", "@auth0/auth0-react", "express-oauth2-jwt-bearer", "next-auth", "passport", "jsonwebtoken"].map((d) => [d, "auth authentication"])),
  openai: "openai model api docs",
  ...Object.fromEntries(["prisma", "drizzle-orm", "typeorm", "sequelize", "mongoose"].map((d) => [d, "database"])),
};

export const MARKERS = {
  "tsconfig.json": "typescript",
  "pyproject.toml": "python", "requirements.txt": "python",
  "go.mod": "go",
  "Cargo.toml": "rust",
  Gemfile: "ruby",
  "pom.xml": "java", "build.gradle": "java",
  "AndroidManifest.xml": "android",
  "classes.dex": "android decompile", "resources.arsc": "android decompile",
  "PLAN.md": "plan implementation execute",
  "SKILL.md": "skill create write",
  ".codex-plugin/plugin.json": "codex plugin manifest",
};

const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : "");

export function summarize({ deps = [], markers = [] } = {}) {
  const words = [...deps.map((d) => own(DEP_WORDS, d)), ...markers.map((m) => own(MARKERS, m))].join(" ").split(" ").filter(Boolean);
  return [...new Set(words)].join(" ");
}

export function projectSummary(root) {
  try {
    const r = readChecked(join(root, "package.json"), 256 * 1024, { base: root, nofollow: true });
    if (r.error) return "";
    let deps = [];
    if (r.data) {
      const j = JSON.parse(r.data);
      deps = Object.keys({ ...j.dependencies, ...j.devDependencies });
    }
    const markers = Object.keys(MARKERS).filter((m) => {
      try { return lstatSync(join(root, m)).isFile(); } catch { return false; }
    });
    return summarize({ deps, markers });
  } catch { return ""; }
}
