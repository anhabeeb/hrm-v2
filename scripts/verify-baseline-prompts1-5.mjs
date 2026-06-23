import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function file(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function exists(relativePath, label = relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing ${label}`);
  }
}

function includes(content, marker, label) {
  if (!content.includes(marker)) {
    failures.push(`Missing marker: ${label ?? marker}`);
  }
}

const schema = file("database/schema.sql");
const seed = file("database/seed.sql");
const workerWrangler = file("worker/wrangler.toml");
const rootWrangler = fs.existsSync(path.join(root, "wrangler.toml")) ? file("wrangler.toml") : "";
const passwordCode = file("worker/src/auth/password.ts");
const workerIndex = file("worker/src/index.ts");
const allWorkerRoutes = fs.readdirSync(path.join(root, "worker/src/routes"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => file(`worker/src/routes/${name}`))
  .join("\n");

[
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "role_mapping_rules",
  "access_scope_rules",
  "locations",
  "departments",
  "positions",
  "job_levels",
  "employee_statuses",
  "employee_number_settings",
  "employee_job_history",
  "employee_contacts",
  "employee_addresses",
  "document_categories",
  "document_types",
  "employee_documents",
  "employee_document_versions",
  "document_required_rules",
  "document_retention_rules",
  "asset_categories",
  "asset_items",
  "employee_asset_assignments",
  "employee_notes",
  "employee_note_versions",
  "employee_note_attachments",
  "audit_logs",
].forEach((table) => includes(schema, table, `schema table ${table}`));

[
  "role_mappings.view",
  "role_mappings.manage",
  "access_scopes.view",
  "access_scopes.manage",
  "documents.sensitive.view",
  "employees.sensitive.view",
  "employee_notes.restricted.view",
].forEach((permission) => includes(seed, permission, `seed permission ${permission}`));

[
  "worker/src/routes/users.ts",
  "worker/src/routes/roles.ts",
  "worker/src/routes/role-mappings.ts",
  "worker/src/routes/access-scopes.ts",
  "worker/src/routes/organization.ts",
  "worker/src/routes/employees.ts",
  "worker/src/routes/documents.ts",
  "worker/src/routes/assets-notes-audit.ts",
  "worker/src/routes/reports.ts",
  "worker/src/routes/dashboard.ts",
].forEach((relativePath) => exists(relativePath));

[
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
].forEach((relativePath) => exists(relativePath));

[
  "/api/v1/role-mappings",
  "/api/v1/access-scopes",
  "/api/v1/employees",
  "/api/v1/documents",
  "/api/v1/reports",
].forEach((route) => includes(workerIndex, route, `mounted route ${route}`));

includes(workerWrangler, 'database_name = "hrm-v2"', "worker D1 database_name");
includes(workerWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "worker D1 database_id");
includes(workerWrangler, 'bucket_name = "hrm-v2-documents"', "worker R2 bucket");
if (rootWrangler) {
  includes(rootWrangler, 'database_name = "hrm-v2"', "root D1 database_name");
  includes(rootWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "root D1 database_id");
}

includes(passwordCode, "100000", "PBKDF2 100000 iteration cap");
if (passwordCode.includes("210000")) {
  failures.push("PBKDF2 still contains unsupported 210000 iterations");
}

if (failures.length) {
  console.error("Prompt 1-5 baseline verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 1-5 baseline verification passed.");
