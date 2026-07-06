import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "docs", "production", "onboarding-to-employee360-migration-report.md");
const summaryPath = path.join(root, "docs", "production", "onboarding-to-employee360-migration-summary.json");
const requiredSections = [
  "profile_information",
  "contact_emergency",
  "job_assignment",
  "documents",
  "contract",
  "payroll_profile",
  "payment_method",
  "pension",
  "user_access",
  "attendance_roster",
  "assets_uniforms",
  "approval_tasks",
  "final_verification"
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/password|token|secret/gi, "sensitive value")
    .slice(0, 260);
}

function dataFrom(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

function row(status, check, detail) {
  return { status, check, detail: redact(detail) };
}

function table(rows) {
  return [
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...rows.map((item) => `| ${item.status} | ${item.check.replaceAll("|", "\\|")} | ${item.detail.replaceAll("|", "\\|")} |`)
  ].join("\n");
}

function statusFromRows(rows) {
  if (rows.some((item) => item.status === "FAIL")) return "FAIL";
  if (rows.some((item) => item.status === "WARNING" || item.status === "SKIPPED")) return "WARNING";
  return "PASS";
}

function sourceChecks() {
  const schema = read("database/schema.sql");
  const sectionStatus = read("worker/src/employee-setup/section-status.ts");
  const employeesRoute = read("worker/src/routes/employees.ts");
  const packageJson = JSON.parse(read("package.json"));
  return [
    row(schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses") && schema.includes("source_case_id"), "Employee setup section-status schema supports source_case_id", "schema.sql checked"),
    row(requiredSections.every((section) => sectionStatus.includes(section)), "Employee 360 registry sections are present", `${requiredSections.length} required sections checked`),
    row(employeesRoute.includes('employeeRoutes.get("/setup"') && employeesRoute.includes("employee_setup_section_statuses") && employeesRoute.includes("source_case_id"), "Employee setup queue endpoint is present", "/api/v1/employees/setup source checked"),
    row(packageJson.scripts?.["migrate:onboarding-to-employee360-setup"] === "node scripts/migrate-onboarding-cases-to-employee360-setup.mjs", "Package script registered", "migrate:onboarding-to-employee360-setup")
  ].map((item) => ({ ...item, status: item.status ? "PASS" : "FAIL" }));
}

async function apiFetch(apiUrl, token, urlPath, options = {}) {
  const response = await fetch(`${apiUrl}${urlPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Request-Id": `employee360_migration_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      ...(options.headers ?? {})
    }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const code = payload?.error?.code ?? response.status;
    const message = payload?.error?.message ?? response.statusText;
    throw new Error(`HTTP ${response.status} ${code}: ${message}`);
  }
  return dataFrom(payload);
}

async function getMigrationTargets(apiUrl, token, env) {
  if (env.HRM_MIGRATE_EMPLOYEE_ID) {
    return [{ employee_id: env.HRM_MIGRATE_EMPLOYEE_ID, case_id: env.HRM_MIGRATE_CASE_ID || null, source: "employee_env" }];
  }
  if (env.HRM_MIGRATE_CASE_ID) {
    const detail = await apiFetch(apiUrl, token, `/api/v1/onboarding/cases/${encodeURIComponent(env.HRM_MIGRATE_CASE_ID)}`);
    const employeeId = detail?.employee?.id ?? detail?.case?.employee_id;
    if (!employeeId) throw new Error("Onboarding case did not return a linked employee id.");
    return [{ employee_id: String(employeeId), case_id: env.HRM_MIGRATE_CASE_ID, source: "case_env" }];
  }
  const limit = Math.max(1, Math.min(100, Number(env.HRM_MIGRATE_BATCH_LIMIT ?? 25)));
  const result = await apiFetch(apiUrl, token, `/api/v1/onboarding/cases?limit=${limit}&offset=0`);
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  return cases
    .map((item) => ({ employee_id: item.employee_id, case_id: item.id, source: "batch" }))
    .filter((item) => item.employee_id);
}

async function rebuildTarget(apiUrl, token, target) {
  const started = performance.now();
  const result = await apiFetch(apiUrl, token, `/api/v1/employees/${encodeURIComponent(target.employee_id)}/setup-sections/rebuild`, { method: "POST" });
  return {
    ...target,
    duration_ms: Math.round(performance.now() - started),
    readiness_status: result?.readiness?.status ?? null,
    rebuilt_count: result?.rebuilt_count ?? null,
    failed_count: result?.failed_count ?? null
  };
}

function writeReports(summary, rows) {
  ensureDir(reportPath);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(reportPath, `# Onboarding to Employee 360 Setup Migration Report

Status: ${summary.status}
Mode: ${summary.mode}
Generated: ${summary.generated_at}

${table(rows)}

## Summary

- Dry run: ${summary.dry_run ? "yes" : "no"}
- Write confirmed: ${summary.write_confirmed ? "yes" : "no"}
- Target count: ${summary.target_count}
- Migrated count: ${summary.migrated_count}
- Failed count: ${summary.failed_count}

## Safety

- This script does not activate employees.
- This script does not seed production data.
- This script rebuilds Employee 360 setup section statuses only when HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360=true and HRM_MIGRATE_CONFIRM=YES.
- Old onboarding cases remain available as history.
`);
}

async function main() {
  const env = process.env;
  const dryRun = env.HRM_MIGRATE_DRY_RUN !== "false" || env.HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360 !== "true" || env.HRM_MIGRATE_CONFIRM !== "YES";
  const apiUrl = String(env.HRM_MIGRATE_API_URL || env.HRM_PROD_API_URL || "").replace(/\/+$/, "");
  const token = env.HRM_MIGRATE_TOKEN || env.HRM_LIVE_AUTH_TOKEN || "";
  const rows = sourceChecks();
  const migrated = [];
  let failedCount = 0;

  if (dryRun) {
    rows.push(row("PASS", "Dry-run mode", "No Employee 360 setup statuses were written. Set HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360=true and HRM_MIGRATE_CONFIRM=YES to write."));
  } else if (!apiUrl || !token) {
    rows.push(row("FAIL", "Write mode authentication", "Set HRM_MIGRATE_API_URL/HRM_PROD_API_URL and HRM_MIGRATE_TOKEN/HRM_LIVE_AUTH_TOKEN before confirmed migration writes."));
    failedCount += 1;
  } else {
    try {
      const targets = await getMigrationTargets(apiUrl, token, env);
      rows.push(row("PASS", "Migration target discovery", `${targets.length} target(s) selected`));
      for (const target of targets) {
        try {
          migrated.push(await rebuildTarget(apiUrl, token, target));
        } catch (error) {
          failedCount += 1;
          rows.push(row("FAIL", `Migrate ${target.case_id ?? target.employee_id}`, error instanceof Error ? error.message : String(error)));
        }
      }
    } catch (error) {
      failedCount += 1;
      rows.push(row("FAIL", "Migration target discovery", error instanceof Error ? error.message : String(error)));
    }
  }

  const summary = {
    status: failedCount || rows.some((item) => item.status === "FAIL") ? "FAIL" : statusFromRows(rows),
    mode: "employee_360_setup",
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    write_confirmed: !dryRun,
    target_count: migrated.length + failedCount,
    migrated_count: migrated.length,
    failed_count: failedCount,
    required_sections: requiredSections,
    migrated
  };
  writeReports(summary, rows);
  if (summary.status === "FAIL") process.exit(1);
  console.log(`Onboarding to Employee 360 setup migration ${dryRun ? "dry-run" : "write"} completed: ${summary.status}`);
}

await main();
