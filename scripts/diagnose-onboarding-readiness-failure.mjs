import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const reportPath = path.join(projectRoot, "docs", "production", "onboarding-readiness-failure-diagnostics.md");
const caseId = process.env.HRM_DIAG_CASE_ID?.trim();
const jobId = process.env.HRM_DIAG_JOB_ID?.trim();
const requestId = process.env.HRM_DIAG_REQUEST_ID?.trim();

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
  fs.writeFileSync(reportPath, `# Onboarding Readiness Failure Diagnostics\n\nStatus: SKIPPED\n\nSet \`HRM_DIAG_CASE_ID\` to inspect a production onboarding readiness failure. No credentials, tokens, passwords, payroll amounts, bank account numbers, document numbers, or file contents are written by this script.\n`);
  console.log(`[diagnose:onboarding-readiness-failure] Skipped. Report saved: ${reportPath}`);
  process.exit(0);
}

const safeCaseId = caseId.replace(/'/g, "''");
const safeJobId = jobId?.replace(/'/g, "''") ?? "";
const safeRequestId = requestId?.replace(/'/g, "''") ?? "";

const queries = [
  ["Onboarding case snapshot", `SELECT id, employee_id, onboarding_status, activation_status, updated_at FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1;`],
  ["Latest readiness jobs", `SELECT id, job_type, status, progress_message, last_error_code, last_error_message, created_at, updated_at, completed_at FROM background_jobs WHERE job_type = 'ONBOARDING_READINESS_RECALCULATION' AND entity_id = '${safeCaseId}' ${safeJobId ? `AND id = '${safeJobId}'` : ""} ORDER BY created_at DESC LIMIT 5;`],
  ["Background job events", `SELECT event_type, message, created_at FROM background_job_events WHERE job_id IN (SELECT id FROM background_jobs WHERE job_type = 'ONBOARDING_READINESS_RECALCULATION' AND entity_id = '${safeCaseId}' ${safeJobId ? `AND id = '${safeJobId}'` : ""} ORDER BY created_at DESC LIMIT 5) ORDER BY created_at DESC LIMIT 20;`],
  ["Readiness save status", `SELECT request_id, idempotency_key, status, readiness_refresh_status, readiness_refresh_job_id, readiness_refresh_message, updated_at FROM onboarding_workspace_save_statuses WHERE case_id = '${safeCaseId}' ${safeRequestId ? `AND request_id = '${safeRequestId}'` : ""} ORDER BY updated_at DESC LIMIT 5;`],
  ["Module states", `SELECT module_key, is_enabled, updated_at FROM module_control_settings WHERE module_key IN ('onboarding','documents','document_compliance','payroll','payment_methods','payment_institutions','pension','attendance','roster','assets_uniforms','self_service') ORDER BY module_key;`],
  ["Document rule counts", `SELECT COUNT(*) AS required_rule_count FROM document_required_rules WHERE is_active = 1;`],
  ["Employee document count", `SELECT COUNT(*) AS employee_document_count FROM employee_documents WHERE employee_id = (SELECT employee_id FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1);`],
  ["User access readiness inputs", `SELECT e.id AS employee_id, CASE WHEN e.user_id IS NULL THEN 'NO_USER_LINK' ELSE 'USER_LINKED' END AS user_link_state FROM employees e WHERE e.id = (SELECT employee_id FROM employee_onboarding_cases WHERE id = '${safeCaseId}' LIMIT 1);`]
];

const results = queries.map(([label, sql]) => runWranglerSql(label, sql));
const content = [
  "# Onboarding Readiness Failure Diagnostics",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Case ID: ${caseId}`,
  jobId ? `Job ID: ${jobId}` : "Job ID: not provided",
  requestId ? `Request ID: ${requestId}` : "Request ID: not provided",
  "",
  "This report intentionally excludes secrets, tokens, passwords, document numbers, file contents, payroll amounts, and bank account numbers.",
  "",
  ...results.map((result) => result.ok ? table(result.label, result.rows) : `### ${result.label}\n\nERROR: ${result.error}\n`)
].join("\n");

fs.writeFileSync(reportPath, content);
const failed = results.filter((result) => !result.ok);
console.log(`[diagnose:onboarding-readiness-failure] Report saved: ${reportPath}`);
if (failed.length) {
  console.warn(`[diagnose:onboarding-readiness-failure] ${failed.length} diagnostic query group(s) failed. Review the report.`);
}
