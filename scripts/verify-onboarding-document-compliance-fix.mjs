import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function must(condition, message) {
  if (!condition) failures.push(message);
}

function sourceFiles(dir) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(base, entry.name);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...sourceFiles(rel));
    else if (/\.(ts|tsx|sql)$/.test(entry.name)) files.push(rel);
  }
  return files;
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const selfService = read("worker/src/routes/self-service.ts");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const auth = read("worker/src/auth/password.ts");

const missingTable = "employee_document_checklist_items";
const scanned = [
  ...sourceFiles("worker/src"),
  ...sourceFiles("frontend/src"),
  "database/schema.sql",
  "database/seed.sql"
];

for (const file of scanned) {
  must(!read(file).includes(missingTable), `${file} still references ${missingTable}`);
}

must(!schema.includes(missingTable), "schema should not define the missing legacy checklist table when Prompt 15 helpers are used");

[
  "calculateEmployeeDocumentCompliance",
  "getOnboardingDocumentChecklist",
  "getOnboardingDocumentBlockers",
  "Document compliance checklist could not be loaded.",
  "compliance.settings?.document_compliance_enabled === false",
  "required_documents",
  "missing_documents",
  "warning_items: warningItems"
].forEach((marker) => must(lifecycle.includes(marker), `lifecycle missing ${marker}`));

must(/catch\s*\(error\)[\s\S]*Document compliance checklist could not be loaded/.test(lifecycle), "onboarding document checklist failure must be caught and converted to a warning");
must(/getOnboardingDocumentBlockers[\s\S]*checklist\.status === "DISABLED"[\s\S]*return \[\]/.test(lifecycle), "document blockers must be null-safe for disabled/missing compliance");
must(/row\.requirement_status === "REQUIRED" && row\.missing/.test(lifecycle), "document blockers must use Prompt 15 missing status");

[
  "calculateEmployeeDocumentCompliance",
  "getSelfServiceDocumentCompliance",
  "required_documents: visibleRequired",
  "missing_documents: visibleRequired.filter",
  "Contact HR/Admin if a required document needs renewal or replacement."
].forEach((marker) => must(selfService.includes(marker), `self-service missing ${marker}`));

must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecycle), "lifecycle uses browser alert/confirm/prompt");
must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(selfService), "self-service uses browser alert/confirm/prompt");
must(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed");
must(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed");
must(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");
must(auth.includes("PBKDF2_ITERATIONS = 100000") || auth.includes("100000"), "PBKDF2 max iteration guard missing");

if (failures.length) {
  console.error("Onboarding document compliance readiness verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Onboarding document compliance readiness verification passed.");
