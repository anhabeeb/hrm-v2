import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const warnings = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function readOptional(relativePath) {
  const file = path.join(root, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseCorsPolicyFromEnv() {
  const inline = process.env.HRM_R2_CORS_POLICY_JSON;
  const file = process.env.HRM_R2_CORS_POLICY_FILE;
  if (!inline && !file) return null;
  const raw = inline || fs.readFileSync(path.resolve(root, String(file)), "utf8");
  return JSON.parse(raw);
}

function listRules(policy) {
  if (Array.isArray(policy)) return policy;
  if (Array.isArray(policy?.CORSRules)) return policy.CORSRules;
  if (Array.isArray(policy?.corsRules)) return policy.corsRules;
  return [];
}

function values(rule, key) {
  const raw = rule[key] ?? rule[key[0].toLowerCase() + key.slice(1)] ?? [];
  return Array.isArray(raw) ? raw.map((value) => String(value).toLowerCase()) : [];
}

function validateLivePolicy(policy) {
  const rules = listRules(policy);
  check(rules.length > 0, "live R2 CORS policy has no rules");
  const allOrigins = rules.flatMap((rule) => values(rule, "AllowedOrigins"));
  const allMethods = rules.flatMap((rule) => values(rule, "AllowedMethods"));
  const allHeaders = rules.flatMap((rule) => values(rule, "AllowedHeaders"));
  const allExposed = rules.flatMap((rule) => values(rule, "ExposeHeaders"));
  const maxAges = rules.map((rule) => Number(rule.MaxAgeSeconds ?? rule.maxAgeSeconds ?? 0)).filter(Number.isFinite);
  check(allOrigins.includes("https://hr.cafeasiana.com.mv"), "live R2 CORS policy must allow https://hr.cafeasiana.com.mv");
  check(allMethods.includes("put"), "live R2 CORS policy must allow PUT");
  check(allHeaders.includes("content-type") || allHeaders.includes("*"), "live R2 CORS policy must allow content-type");
  check(allHeaders.includes("x-amz-content-sha256") || allHeaders.includes("*"), "live R2 CORS policy should allow x-amz-content-sha256");
  check(allExposed.includes("etag") || allExposed.includes("*"), "live R2 CORS policy should expose ETag");
  check(maxAges.some((value) => value > 0 && value <= 3600), "live R2 CORS policy should use a bounded MaxAgeSeconds");
}

const packageJson = JSON.parse(read("package.json"));
const helper = read("worker/src/utils/r2-direct-upload.ts");
const docs = read("docs/performance/direct-r2-uploads-phase18.md");
const workerCors = readOptional("worker/src/middleware/cors.ts") + read("worker/src/index.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check(packageJson.scripts?.["verify:r2-cors-direct-upload-phase18"] === "node scripts/verify-r2-cors-direct-upload-phase18.mjs", "package.json: verify:r2-cors-direct-upload-phase18 script missing");
check(helper.includes("createDirectR2PresignedPutUrl"), "direct R2 presign helper missing");
check(helper.includes('"Content-Type"'), "presigned upload helper must sign/send Content-Type");
check(helper.includes("X-Amz-Content-Sha256"), "presigned upload helper must account for X-Amz-Content-Sha256");
check(docs.includes("https://hr.cafeasiana.com.mv"), "Phase 18 docs must document production frontend origin");
check(docs.includes('"PUT"'), "Phase 18 docs must document PUT in R2 CORS policy");
check(docs.toLowerCase().includes("content-type"), "Phase 18 docs must document content-type header");
check(docs.includes("ETag"), "Phase 18 docs must document ETag exposure");
check(/x-request-id/i.test(workerCors), "CORS request-id hotfix regressed");
check(/binding\s*=\s*"DB"/.test(wrangler), "D1 binding changed");
check(/binding\s*=\s*"DOCUMENTS_BUCKET"/.test(wrangler), "R2 binding changed");
check(/100000/.test(password), "PBKDF2 iterations changed");

try {
  const policy = parseCorsPolicyFromEnv();
  if (policy) {
    validateLivePolicy(policy);
  } else {
    warnings.push("Live R2 CORS policy not provided; source/static CORS readiness checks completed.");
  }
} catch (error) {
  failures.push(`live R2 CORS policy could not be parsed safely: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error("Phase 18 R2 CORS direct upload verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const warning of warnings) console.log(`SKIPPED: ${warning}`);
console.log("Phase 18 R2 CORS direct upload verification passed.");
