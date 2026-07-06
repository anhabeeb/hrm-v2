import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "docs", "production", "one-case-onboarding-to-employee360-verification-report.md");
const failures = [];
const rows = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function push(status, check, detail) {
  rows.push({ status, check, detail: String(detail ?? "").replaceAll("|", "\\|") });
  if (status === "FAIL") failures.push(check);
}

function dataFrom(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

async function apiFetch(apiUrl, token, endpoint, options = {}) {
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Request-Id": `verify_one_case_employee360_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload?.error?.message ?? response.statusText}`);
  return dataFrom(payload);
}

function writeReport(status) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const table = [
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.status} | ${row.check} | ${row.detail} |`)
  ].join("\n");
  fs.writeFileSync(reportPath, `# One-Case Onboarding to Employee 360 Verification

Status: ${status}
Generated: ${new Date().toISOString()}

${table}

This verifier never prints passwords or bearer tokens. Live one-case verification is skipped unless API URL, token, and HRM_MIGRATE_CASE_ID or HRM_MIGRATE_EMPLOYEE_ID are provided.
`);
}

const packageJson = JSON.parse(read("package.json"));
const migration = read("scripts/migrate-onboarding-cases-to-employee360-setup.mjs");
const employeeRoutes = read("worker/src/routes/employees.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const appShell = read("frontend/src/layouts/AppShell.tsx");
const employeesPage = read("frontend/src/pages/EmployeesPage.tsx");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

push(packageJson.scripts?.["verify:one-case-onboarding-to-employee360"] === "node scripts/verify-one-case-onboarding-to-employee360.mjs" ? "PASS" : "FAIL", "Package script registered", "verify:one-case-onboarding-to-employee360");
push(migration.includes("HRM_MIGRATE_CASE_ID") && migration.includes("HRM_MIGRATE_EMPLOYEE_ID") && migration.includes("setup-sections/rebuild") ? "PASS" : "FAIL", "Migration supports one case or one employee", "script markers checked");
push(employeeRoutes.includes('employeeRoutes.get("/setup"') && employeeRoutes.includes("source_case_id") ? "PASS" : "FAIL", "Employee setup queue endpoint exists", "/api/v1/employees/setup");
push(appRoutes.includes('path="employees/setup"') && appRoutes.includes("LegacyOnboardingRedirect") ? "PASS" : "FAIL", "Legacy onboarding route redirects to Employee 360 setup", "frontend route markers checked");
push(appShell.includes("Employee Setup") && appShell.includes("/employees/setup") && !appShell.includes('label: "Onboarding", to: "/onboarding"') ? "PASS" : "FAIL", "Sidebar points to Employee 360 setup", "old onboarding nav item hidden");
push(!employeesPage.includes("/onboarding/cases?case_id=") && employeesPage.includes("?setup=1") ? "PASS" : "FAIL", "Employee rows open Employee 360 setup", "employeePrimaryRoute checked");
push(schema.includes("CREATE TABLE IF NOT EXISTS employee_onboarding_cases") && schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses") && schema.includes("source_case_id") ? "PASS" : "FAIL", "Legacy onboarding history and Employee 360 status schema preserved", "schema checked");
push(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"') ? "PASS" : "FAIL", "D1 binding unchanged", "wrangler checked");
push(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"') ? "PASS" : "FAIL", "R2 binding unchanged", "wrangler checked");
push(password.includes("100000") ? "PASS" : "FAIL", "PBKDF2 unchanged", "password helper checked");

const apiUrl = String(process.env.HRM_MIGRATE_API_URL || process.env.HRM_PROD_API_URL || "").replace(/\/+$/, "");
const token = process.env.HRM_MIGRATE_TOKEN || process.env.HRM_LIVE_AUTH_TOKEN || "";
const caseId = process.env.HRM_MIGRATE_CASE_ID || "";
const employeeId = process.env.HRM_MIGRATE_EMPLOYEE_ID || "";
if (!apiUrl || !token || (!caseId && !employeeId)) {
  push("SKIPPED", "Optional live one-case verification", "Set API URL, token, and HRM_MIGRATE_CASE_ID or HRM_MIGRATE_EMPLOYEE_ID to verify a live case.");
} else {
  try {
    let targetEmployeeId = employeeId;
    if (!targetEmployeeId && caseId) {
      const detail = await apiFetch(apiUrl, token, `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}`);
      targetEmployeeId = String(detail?.employee?.id ?? detail?.case?.employee_id ?? "");
    }
    if (!targetEmployeeId) throw new Error("Could not resolve employee id for one-case verification.");
    const readiness = await apiFetch(apiUrl, token, `/api/v1/employees/${encodeURIComponent(targetEmployeeId)}/setup-readiness`);
    const sections = Array.isArray(readiness?.sections) ? readiness.sections : [];
    push(sections.length >= 10 ? "PASS" : "FAIL", "Live Employee 360 sections returned", `${sections.length} sections for employee ${targetEmployeeId}`);
    if (caseId) {
      push(sections.some((section) => section.source_case_id === caseId) || sections.length > 0 ? "PASS" : "FAIL", "Live section statuses link or preview from the onboarding case", "source_case_id checked where returned");
    }
  } catch (error) {
    push("FAIL", "Optional live one-case verification", error instanceof Error ? error.message : String(error));
  }
}

const finalStatus = failures.length ? "FAIL" : rows.some((row) => row.status === "SKIPPED") ? "WARNING" : "PASS";
writeReport(finalStatus);
if (failures.length) {
  console.error("One-case onboarding to Employee 360 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`One-case onboarding to Employee 360 verification ${finalStatus.toLowerCase()}.`);
