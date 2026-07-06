import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "docs", "production", "live-employee360-setup-rollout-report.md");
const timeoutMs = Math.max(1000, Number(process.env.HRM_LIVE_VERIFY_TIMEOUT_MS ?? 15000));

function redacted(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/password|token|secret/gi, "sensitive value")
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "Database check failed")
    .slice(0, 260);
}

function dataFrom(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

function requestId(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

async function timed(name, action) {
  const started = performance.now();
  try {
    const result = await action();
    return { status: "PASS", check: name, http: result.http ?? "-", duration_ms: Math.round(performance.now() - started), detail: result.detail ?? "ok", payload: result.payload };
  } catch (error) {
    return { status: "FAIL", check: name, http: "-", duration_ms: Math.round(performance.now() - started), detail: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchJson(apiUrl, endpoint, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId("live_employee360_rollout"),
        ...(options.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload?.error?.message ?? response.statusText}`);
    return { http: response.status, payload: dataFrom(payload) };
  } finally {
    clearTimeout(timer);
  }
}

async function authFetch(apiUrl, token, endpoint, options = {}) {
  return fetchJson(apiUrl, endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });
}

function writeReport(rows, status) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const table = [
    "| Status | Check | HTTP | Duration ms | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.status} | ${row.check} | ${row.http ?? "-"} | ${row.duration_ms ?? "-"} | ${redacted(row.detail).replaceAll("|", "\\|")} |`)
  ].join("\n");
  fs.writeFileSync(reportPath, `# Live Employee 360 Setup Rollout Report

Status: ${status}
Generated: ${new Date().toISOString()}

${table}

Safety notes:

- Credentials are read from environment variables only.
- Passwords and tokens are never printed.
- no production activation is attempted by this verifier.
- Final verification is not run unless HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE=true.
- Activation is never called by this verifier.
`);
}

const frontendUrl = String(process.env.HRM_PROD_FRONTEND_URL || "").replace(/\/+$/, "");
const apiUrl = String(process.env.HRM_PROD_API_URL || "").replace(/\/+$/, "");
const email = process.env.HRM_LIVE_LOGIN_EMAIL || "";
const password = process.env.HRM_LIVE_LOGIN_PASSWORD || "";
const caseId = process.env.HRM_LIVE_TEST_CASE_ID || process.env.HRM_MIGRATE_CASE_ID || "";
const employeeIdFromEnv = process.env.HRM_LIVE_TEST_EMPLOYEE_ID || process.env.HRM_MIGRATE_EMPLOYEE_ID || "";
const allowFinalVerificationWrite = process.env.HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE === "true";

const rows = [];
if (!frontendUrl || !apiUrl || !email || !password) {
  rows.push({ status: "SKIPPED", check: "Live environment", http: "-", duration_ms: "-", detail: "Set HRM_PROD_FRONTEND_URL, HRM_PROD_API_URL, HRM_LIVE_LOGIN_EMAIL, and HRM_LIVE_LOGIN_PASSWORD to run live verification." });
  writeReport(rows, "WARNING");
  console.log("Live Employee 360 setup rollout verification skipped; live credentials are not configured.");
  process.exit(0);
}

const login = await timed("Login", async () => {
  const result = await fetchJson(apiUrl, "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const token = result.payload?.token ?? result.payload?.access_token ?? result.payload?.session?.token;
  if (!token) throw new Error("Login succeeded but no token was returned.");
  return { ...result, detail: "Authenticated; token stored in memory only.", payload: { token } };
});
rows.push(login);
if (login.status === "FAIL") {
  writeReport(rows, "FAIL");
  process.exit(1);
}

const token = login.payload.token;
rows.push(await timed("Current user/session", async () => {
  const result = await authFetch(apiUrl, token, "/api/v1/auth/me");
  return { ...result, detail: result.payload?.user ? "Current user loaded." : "Session endpoint responded." };
}));
rows.push(await timed("Setup queue", async () => {
  const result = await authFetch(apiUrl, token, "/api/v1/employees/setup?limit=10");
  const count = Array.isArray(result.payload?.setup_employees) ? result.payload.setup_employees.length : Array.isArray(result.payload?.employees) ? result.payload.employees.length : 0;
  return { ...result, detail: `${count} setup row(s) returned.` };
}));
rows.push(await timed("Employee setup route reachable from frontend", async () => {
  const response = await fetch(`${frontendUrl}/employees/setup`, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { http: response.status, detail: "Frontend route returned a response." };
}));

let employeeId = employeeIdFromEnv;
if (!employeeId && caseId) {
  rows.push(await timed("Resolve employee from onboarding case", async () => {
    const result = await authFetch(apiUrl, token, `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}`);
    employeeId = String(result.payload?.employee?.id ?? result.payload?.case?.employee_id ?? "");
    if (!employeeId) throw new Error("Linked employee id was not returned.");
    return { ...result, detail: `Resolved employee ${employeeId}.` };
  }));
}

if (!employeeId) {
  rows.push({ status: "SKIPPED", check: "One employee setup readiness", http: "-", duration_ms: "-", detail: "Set HRM_LIVE_TEST_EMPLOYEE_ID or HRM_LIVE_TEST_CASE_ID to verify one migrated setup record." });
} else {
  rows.push(await timed("Employee 360 setup readiness", async () => {
    const result = await authFetch(apiUrl, token, `/api/v1/employees/${encodeURIComponent(employeeId)}/setup-readiness`);
    const sections = Array.isArray(result.payload?.sections) ? result.payload.sections : [];
    if (!sections.length) throw new Error("No Employee 360 setup sections were returned.");
    return { ...result, detail: `${sections.length} sections returned; status=${result.payload?.readiness?.status ?? "unknown"}.` };
  }));
  if (allowFinalVerificationWrite) {
    rows.push(await timed("Employee 360 final verification write", async () => {
      const result = await authFetch(apiUrl, token, `/api/v1/employees/${encodeURIComponent(employeeId)}/setup/final-verification`, { method: "POST" });
      return { ...result, detail: `Final verification returned ${result.payload?.verification?.status ?? "unknown"}.` };
    }));
  } else {
    rows.push({ status: "SKIPPED", check: "Employee 360 final verification write", http: "-", duration_ms: "-", detail: "Skipped by default. Set HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE=true only for an approved test employee." });
  }
  rows.push({ status: "PASS", check: "Activation safety", http: "-", duration_ms: "-", detail: "Activation endpoint was not called. Activation still requires server final verification in source." });
}

const status = rows.some((row) => row.status === "FAIL") ? "FAIL" : rows.some((row) => row.status === "SKIPPED") ? "WARNING" : "PASS";
writeReport(rows, status);
if (status === "FAIL") {
  console.error("Live Employee 360 setup rollout verification failed. See docs/production/live-employee360-setup-rollout-report.md.");
  process.exit(1);
}
console.log(`Live Employee 360 setup rollout verification ${status.toLowerCase()}.`);
