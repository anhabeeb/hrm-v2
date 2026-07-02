import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function check(message, condition) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

function readTree(relativeDir) {
  const root = path.join(rootDir, relativeDir);
  if (!fs.existsSync(root)) return "";
  const chunks = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

const packageJson = JSON.parse(read("package.json"));
const index = read("worker/src/index.ts");
const performance = read("worker/src/utils/performance.ts");
const apiClient = read("frontend/src/lib/api.ts");
const frontendSource = readTree("frontend/src");

check("package.json: verify:cors-request-id-hotfix script is registered", packageJson.scripts?.["verify:cors-request-id-hotfix"] === "node scripts/verify-cors-request-id-hotfix.mjs");

for (const header of [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-Request-Id",
  "X-Request-ID",
  "x-request-id",
  "X-Correlation-Id",
  "x-correlation-id",
  "X-Client-Request-Id",
  "x-client-request-id",
  "X-HRM-Company-Id",
  "x-hrm-company-id",
  "X-Tenant-Id",
  "x-tenant-id",
  "X-Timezone",
  "x-timezone"
]) {
  check(`worker/src/index.ts: CORS allowed headers include ${header}`, index.includes(`"${header}"`));
}

for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) {
  check(`worker/src/index.ts: CORS allowed methods include ${method}`, index.includes(`"${method}"`));
}

includes("worker/src/index.ts", "PRODUCTION_FRONTEND_ORIGIN = \"https://hr.cafeasiana.com.mv\"", "production HR frontend origin remains explicitly allowed");
includes("worker/src/index.ts", "LOCAL_FRONTEND_ORIGINS", "local/dev frontend origins remain available for non-configured development");
includes("worker/src/index.ts", "Access-Control-Allow-Origin", "CORS sets allow-origin");
includes("worker/src/index.ts", "Access-Control-Allow-Credentials", "CORS supports credentialed requests");
includes("worker/src/index.ts", "Access-Control-Allow-Headers", "CORS sets allow-headers");
includes("worker/src/index.ts", "Access-Control-Allow-Methods", "CORS sets allow-methods");
includes("worker/src/index.ts", "Access-Control-Max-Age", "CORS sets preflight max age");
includes("worker/src/index.ts", "Vary\", \"Origin", "CORS response varies by Origin");
includes("worker/src/index.ts", "c.req.method === \"OPTIONS\"", "OPTIONS preflight is handled explicitly");
includes("worker/src/index.ts", "return c.body(null, 204)", "OPTIONS preflight returns empty 204");
excludes("worker/src/index.ts", /Access-Control-Allow-Origin["',\s]+\*/i, "wildcard origin is not used with credentials");

const optionsIndex = index.indexOf("c.req.method === \"OPTIONS\"");
const timingIndex = index.indexOf("withRouteTiming()");
const authRouteIndex = index.indexOf("app.route(\"/api/v1/auth\"");
check("worker/src/index.ts: OPTIONS preflight is handled before route timing middleware", optionsIndex >= 0 && timingIndex >= 0 && optionsIndex < timingIndex);
check("worker/src/index.ts: OPTIONS preflight is handled before auth routes", optionsIndex >= 0 && authRouteIndex >= 0 && optionsIndex < authRouteIndex);

includes("frontend/src/lib/api.ts", "X-Request-ID", "global API client request id header is preserved");
includes("frontend/src/lib/api.ts", "createApiRequestId", "global API client still creates request ids");
includes("worker/src/utils/performance.ts", "X-Request-Id", "performance middleware still emits request id");
includes("worker/src/utils/performance.ts", "Server-Timing", "performance timing headers are preserved");
includes("worker/src/utils/performance.ts", "private, no-store", "authenticated HR API responses remain private/no-store");
excludes("worker/src/utils/performance.ts", /Cache-Control["',\s]+public/i, "performance middleware must not public-cache authenticated API responses");

includes("worker/wrangler.toml", 'binding = "DB"', "D1 binding remains DB");
includes("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");
includes("worker/src/auth/password.ts", "100000", "PBKDF2 iterations remain 100000");
check("frontend/src: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(frontendSource));
check("frontend/src: dark mode must not be introduced", !/\bdark:/i.test(frontendSource));

if (failures.length) {
  console.error("CORS request-id hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("CORS request-id hotfix verification passed.");
