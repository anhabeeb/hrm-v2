import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const productionDocsDir = path.join(rootDir, "docs", "production");

export function projectPath(relativePath) {
  return path.join(rootDir, relativePath);
}

export function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

export function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath));
}

export function ensureProductionDocsDir() {
  fs.mkdirSync(productionDocsDir, { recursive: true });
}

export function writeReport(relativePath, markdown) {
  const filePath = projectPath(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${markdown.trim()}\n`);
}

export function createCheckCollector() {
  const checks = [];
  return {
    check(label, passed, details = "") {
      checks.push({ label, passed: Boolean(passed), details });
    },
    checks,
    failures() {
      return checks.filter((item) => !item.passed);
    }
  };
}

export function markdownForChecks(title, checks, extraSections = []) {
  const passed = checks.filter((item) => item.passed).length;
  const failed = checks.length - passed;
  const rows = checks
    .map((item) => `| ${item.passed ? "PASS" : "FAIL"} | ${escapeTable(item.label)} | ${escapeTable(item.details || "")} |`)
    .join("\n");
  return `# ${title}

Generated: ${new Date().toISOString()}

Summary: ${passed} passed, ${failed} failed.

| Status | Check | Details |
| --- | --- | --- |
${rows}

${extraSections.join("\n\n")}
`;
}

export function escapeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function collectSourceFiles(relativeDirs, extensions = [".ts", ".tsx", ".js", ".mjs", ".json", ".toml", ".sql", ".md"]) {
  const files = [];
  const excludedParts = new Set([".git", "node_modules", ".wrangler", "dist", "build", ".cache", ".turbo", "coverage"]);
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (excludedParts.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (extensions.includes(path.extname(entry.name))) {
        files.push(full);
      }
    }
  }
  for (const relativeDir of relativeDirs) visit(projectPath(relativeDir));
  return files;
}

export function combinedSource(relativeDirs, extensions) {
  return collectSourceFiles(relativeDirs, extensions)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

export function hasBrowserPromptUsage() {
  return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(combinedSource(["frontend/src", "worker/src"], [".ts", ".tsx", ".js", ".mjs"]));
}

export function hasDarkModeMarker() {
  return /\bdark:|\bdarkMode\b|classList\.add\(["']dark["']\)/.test(combinedSource(["frontend/src", "frontend"], [".ts", ".tsx", ".js", ".mjs", ".css", ".html"]));
}

export function packageScripts() {
  return JSON.parse(read("package.json")).scripts ?? {};
}

export function validateZipListingFromText(listingText) {
  const bad = [];
  for (const raw of String(listingText).split(/\r?\n/)) {
    const name = raw.trim();
    if (!name) continue;
    if (name.includes("\\")) bad.push(`backslash:${name}`);
    if (/(^|\/)\.git(\/|$)/.test(name)) bad.push(`git:${name}`);
    if (/(^|\/)node_modules(\/|$)/.test(name)) bad.push(`node_modules:${name}`);
    if (/(^|\/)\.wrangler(\/|$)/.test(name)) bad.push(`wrangler:${name}`);
    if (/(^|\/)(dist|build|\.cache|\.turbo|coverage)(\/|$)/.test(name)) bad.push(`generated:${name}`);
    if (/\.log$/i.test(name)) bad.push(`log:${name}`);
    if (/\.zip$/i.test(name)) bad.push(`nested_zip:${name}`);
    if (/(^|\/)\.env(\.local)?$/i.test(name)) bad.push(`env:${name}`);
    if (/(^|\/)\.dev\.vars$/i.test(name)) bad.push(`devvars:${name}`);
    if (/(secret|private-key|credentials)/i.test(name)) bad.push(`secret_like:${name}`);
  }
  return bad;
}
