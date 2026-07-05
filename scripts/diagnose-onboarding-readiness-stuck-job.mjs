import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const reportPath = path.join(projectRoot, "docs", "production", "onboarding-readiness-stuck-job-diagnostics.md");
const caseId = process.env.HRM_DIAG_CASE_ID?.trim();
const jobId = process.env.HRM_DIAG_JOB_ID?.trim();
const requestId = process.env.HRM_DIAG_REQUEST_ID?.trim();

function escapeSql(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function runWranglerSql(label, sql) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "wrangler",
    "d1",
    "execute",
    "hrm-v2",
    "--remote",
    "--config",
    "worker/wrangler.toml",
    "--json",
    "--command",
    sql
  ];
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });
  if (result.status !== 0) {
    return { label, ok: false, error: `Wrangler exited ${result.status}: ${(result.stderr || "").slice(0, 500)}` };
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    const rows = Array.isArray(parsed) ? parsed.flatMap((item) => item?.results ?? item?.result ?? []) : parsed?.results ?? [];
    return { label, ok: true, rows };
  } catch {
    return { label, ok: false, error: "Could not parse Wrangler JSON output." };
  }
}

function table(title, rows) {
  if (!rows?.length) return `### ${title}\n\nNo rows returned.\n`;
  const keys = Object.keys(rows[0]);
  const header = `| ${keys.join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows.slice(0, 20).map((row) => `| ${keys.map((key) => String(row[key] ?? "").replace(/\|/g, "/").slice(0, 160)).join(" | ")} |`);
  return `### ${title}\n\n${[header, divider, ...body].join("\n")}\n`;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });

if (!caseId) {
  fs.writeFileSync(reportPath, [
    "# Onboarding Readiness Stuck Job Diagnostics",
    "",
    "Status: SKIPPED",
    "",
    "Set `HRM_DIAG_CASE_ID` to inspect a production onboarding readiness job. Optional: `HRM_DIAG_JOB_ID` and `HRM_DIAG_REQUEST_ID`.",
    "",
    "This script writes only safe operational metadata. It does not print credentials, tokens, passwords, payroll amounts, bank account numbers, document numbers, or file contents."
  ].join("\n"));
  console.log(`[diagnose:onboarding-readiness-stuck-job] Skipped. Report saved: ${reportPath}`);
  process.exit(0);
}

const safeCaseId = escapeSql(caseId);
const safeJobId = jobId ? escapeSql(jobId) : "";
const safeRequestId = requestId ? escapeSql(requestId) : "";
const jobFilter = safeJobId ? `AND id = '${safeJobId}'` : "";

const queries = [
  ["Onboarding case snapshot", `SELECT id, employee_id, onboarding_status, activation_status, updated_at FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1;`],
  ["Latest readiness jobs", `SELECT id, status, progress_current, progress_total, progress_message, started_at, completed_at, last_error_code, last_error_message, created_at, updated_at, CAST((julianday('now') - julianday(COALESCE(started_at, created_at))) * 86400000 AS INTEGER) AS runtime_ms, CAST((julianday('now') - julianday(updated_at)) * 86400000 AS INTEGER) AS heartbeat_age_ms FROM background_jobs WHERE job_type = 'ONBOARDING_READINESS_RECALCULATION' AND entity_id = '${safeCaseId}' ${jobFilter} ORDER BY created_at DESC LIMIT 5;`],
  ["Running readiness jobs older than max runtime", `SELECT id, status, progress_message, started_at, updated_at, CAST((julianday('now') - julianday(COALESCE(started_at, created_at))) * 86400000 AS INTEGER) AS runtime_ms FROM background_jobs WHERE job_type = 'ONBOARDING_READINESS_RECALCULATION' AND entity_id = '${safeCaseId}' AND status IN ('QUEUED','RUNNING','RETRYING') AND CAST((julianday('now') - julianday(COALESCE(started_at, created_at))) * 86400000 AS INTEGER) > 180000 ORDER BY updated_at DESC LIMIT 10;`],
  ["Background job events", `SELECT event_type, message, created_at FROM background_job_events WHERE job_id IN (SELECT id FROM background_jobs WHERE job_type = 'ONBOARDING_READINESS_RECALCULATION' AND entity_id = '${safeCaseId}' ${jobFilter} ORDER BY created_at DESC LIMIT 5) ORDER BY created_at DESC LIMIT 20;`],
  ["Readiness save status", `SELECT request_id, idempotency_key, status, readiness_refresh_status, readiness_refresh_job_id, readiness_refresh_message, updated_at FROM onboarding_workspace_save_statuses WHERE onboarding_case_id = '${safeCaseId}' ${safeRequestId ? `AND request_id = '${safeRequestId}'` : ""} ORDER BY updated_at DESC LIMIT 5;`],
  ["Section inputs: module states", `SELECT module_key, is_enabled, updated_at FROM module_control_settings WHERE module_key IN ('onboarding','documents','document_compliance','payroll','payment_methods','payment_institutions','pension','attendance','roster','assets_uniforms','self_service') ORDER BY module_key;`],
  ["Section inputs: document required rules count", `SELECT COUNT(*) AS required_rule_count FROM document_required_rules WHERE is_active = 1;`],
  ["Section inputs: employee document count", `SELECT COUNT(*) AS employee_document_count FROM employee_documents WHERE employee_id = (SELECT employee_id FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1);`],
  ["Section inputs: payroll/payment/pension presence", `SELECT e.id AS employee_id, CASE WHEN pm.id IS NULL THEN 'NO_PAYMENT_METHOD' ELSE 'PAYMENT_METHOD_EXISTS' END AS payment_method_state, CASE WHEN epp.id IS NULL THEN 'NO_PENSION_PROFILE' ELSE 'PENSION_PROFILE_EXISTS' END AS pension_state FROM employees e LEFT JOIN employee_payment_methods pm ON pm.employee_id = e.id AND pm.status = 'ACTIVE' AND pm.is_primary = 1 LEFT JOIN employee_pension_profiles epp ON epp.employee_id = e.id AND epp.status = 'ACTIVE' WHERE e.id = (SELECT employee_id FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1) LIMIT 1;`],
  ["Section inputs: user access", `SELECT e.id AS employee_id, CASE WHEN e.user_id IS NULL THEN 'NO_USER_LINK' ELSE 'USER_LINKED' END AS user_link_state FROM employees e WHERE e.id = (SELECT employee_id FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1);`]
];

const results = queries.map(([label, sql]) => runWranglerSql(label, sql));
const content = [
  "# Onboarding Readiness Stuck Job Diagnostics",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Case ID: ${caseId}`,
  jobId ? `Job ID: ${jobId}` : "Job ID: not provided",
  requestId ? `Request ID: ${requestId}` : "Request ID: not provided",
  "",
  "A readiness job is considered stale when it remains queued/running/retrying beyond 180 seconds or has no heartbeat update beyond 180 seconds.",
  "",
  "This report intentionally excludes secrets, tokens, passwords, document numbers, file contents, payroll amounts, and bank account numbers.",
  "",
  ...results.map((result) => result.ok ? table(result.label, result.rows) : `### ${result.label}\n\nERROR: ${result.error}\n`)
].join("\n");

fs.writeFileSync(reportPath, content);
const failed = results.filter((result) => !result.ok);
console.log(`[diagnose:onboarding-readiness-stuck-job] Report saved: ${reportPath}`);
if (failed.length) {
  console.warn(`[diagnose:onboarding-readiness-stuck-job] ${failed.length} diagnostic query group(s) failed. Review the report.`);
}
