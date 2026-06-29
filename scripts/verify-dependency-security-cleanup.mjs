import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walk(dir, predicate = () => true) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".wrangler", ".git"].includes(entry.name)) continue;
    const full = path.join(absolute, entry.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...walk(relative, predicate));
    else if (predicate(relative)) files.push(relative);
  }
  return files;
}

function packageVersionsFromLock(packageName) {
  const lock = JSON.parse(read("package-lock.json"));
  const versions = new Set();
  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (packagePath === `node_modules/${packageName}` || packagePath.endsWith(`/node_modules/${packageName}`)) {
      if (metadata?.version) versions.add(String(metadata.version));
    }
  }
  return Array.from(versions).sort();
}

function semverAtLeast(version, minimum) {
  const parse = (value) => value.split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = parse(version);
  const minimumParts = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] > minimumParts[index]) return true;
    if (currentParts[index] < minimumParts[index]) return false;
  }
  return true;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });
  return result;
}

function runNpm(args) {
  if (process.platform === "win32") {
    return run("cmd", ["/c", "npm", ...args]);
  }
  return run("npm", args);
}

assert(exists("package-lock.json"), "package-lock.json must remain present.");
assert(exists("docs/dependency-security-audit.md"), "Dependency security audit document is missing.");

const rootPackage = JSON.parse(read("package.json"));
const workerPackage = JSON.parse(read("worker/package.json"));
assert(rootPackage.scripts?.["verify:dependency-security-cleanup"] === "node scripts/verify-dependency-security-cleanup.mjs", "verify:dependency-security-cleanup package script is missing.");
assert(rootPackage.devDependencies?.wrangler === "^4.105.0", "Root Wrangler dependency must remain ^4.105.0.");
assert(workerPackage.devDependencies?.wrangler === "^4.105.0", "Worker Wrangler dependency must remain ^4.105.0.");

const expectedVersions = {
  wrangler: "4.105.0",
  miniflare: "4.20260625.0",
  undici: "7.28.0",
  ws: "8.21.0"
};

for (const [packageName, minimumVersion] of Object.entries(expectedVersions)) {
  const versions = packageVersionsFromLock(packageName);
  assert(versions.length === 1, `Expected one ${packageName} version, found ${versions.join(", ") || "none"}.`);
  assert(semverAtLeast(versions[0], minimumVersion), `${packageName}@${versions[0]} is below required ${minimumVersion}.`);
}

const doc = read("docs/dependency-security-audit.md");
for (const marker of [
  "4 vulnerabilities total",
  "wrangler@4.56.0",
  "wrangler@4.105.0",
  "miniflare@4.20260625.0",
  "undici@7.28.0",
  "ws@8.21.0",
  "Production Impact Assessment",
  "0 vulnerabilities"
]) {
  assert(doc.includes(marker), `Dependency security audit document missing marker: ${marker}`);
}

const auditResult = runNpm(["audit", "--json"]);
if (auditResult.error) {
  throw new Error(`Could not run npm audit --json: ${auditResult.error.message}`);
}
const auditOutput = `${auditResult.stdout || ""}${auditResult.stderr || ""}`.trim();
assert(auditOutput, "npm audit --json returned no output.");
let audit;
try {
  audit = JSON.parse(auditResult.stdout || auditOutput);
} catch (error) {
  throw new Error(`Could not parse npm audit --json output: ${error.message}`);
}
const counts = audit.metadata?.vulnerabilities ?? {};
assert((counts.high ?? 0) === 0, "npm audit reports high vulnerabilities.");
assert((counts.critical ?? 0) === 0, "npm audit reports critical vulnerabilities.");
const fixableHigh = Object.values(audit.vulnerabilities ?? {}).filter((entry) =>
  ["high", "critical"].includes(entry?.severity) && entry?.fixAvailable
);
assert(fixableHigh.length === 0, `npm audit reports fixable high/critical vulnerabilities: ${fixableHigh.map((entry) => entry.name).join(", ")}`);

const reactVersions = packageVersionsFromLock("react");
const reactDomVersions = packageVersionsFromLock("react-dom");
assert(reactVersions.length === 1, `Expected one React version, found ${reactVersions.join(", ") || "none"}.`);
assert(reactDomVersions.length === 1, `Expected one React DOM version, found ${reactDomVersions.join(", ") || "none"}.`);
assert(reactVersions[0].split(".")[0] === reactDomVersions[0].split(".")[0], "React and React DOM major versions must remain compatible.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('binding = "DB"'), "D1 binding name changed.");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('binding = "DOCUMENTS_BUCKET"'), "R2 binding name changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const passwordSource = read("worker/src/auth/password.ts");
assert(passwordSource.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!passwordSource.includes("210000"), "PBKDF2 must not revert to 210000.");

const frontendSources = walk("frontend/src", (file) => /\.(ts|tsx)$/.test(file))
  .map((file) => `${file}\n${read(file)}`)
  .join("\n");
assert(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");
assert(!/\bdark:|darkMode\b/.test(frontendSources), "Dark mode markers must not be introduced.");

for (const scriptName of [
  "verify:professional-app-loader",
  "verify:global-popup-alerts",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
]) {
  assert(rootPackage.scripts?.[scriptName], `${scriptName} package script is missing.`);
}

for (const file of [
  "scripts/verify-professional-app-loader.mjs",
  "scripts/verify-global-popup-alerts.mjs",
  "scripts/verify-form-action-validation-hardening.mjs",
  "scripts/verify-employee-user-account-linking.mjs",
  "scripts/verify-import-export-standardization.mjs",
  "scripts/verify-button-color-standardization.mjs",
  "scripts/verify-frontend-static-assets.mjs",
  "scripts/verify-frontend-bundle-integrity.mjs",
  "scripts/verify-filter-search-date-standardization.mjs",
  "scripts/verify-command-center-dashboard.mjs"
]) {
  assert(exists(file), `${file} is missing.`);
}

console.log("Dependency security cleanup verification passed.");
