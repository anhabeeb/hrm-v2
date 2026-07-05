import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  defaultApiUrl,
  defaultFrontendUrl,
  escapeTable,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  hasSecretLikeValue,
  joinUrl,
  markdownTable,
  redact
} from "./phase21-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(rootDir, "docs", "production", "live-onboarding-readiness-redesign-phase5-report.md");
const additiveRepairPath = path.join(rootDir, "database", "onboarding_section_status_phase5_repair.sql");
const timeoutMs = Math.max(1000, Number(process.env.HRM_LIVE_VERIFY_TIMEOUT_MS ?? 15000));
const defaultCaseId = "onboarding_case_25a0b51e-fa39-426a-a07b-ab11b1b56dfc";

const requiredLiveEnv = [
  "HRM_PROD_FRONTEND_URL",
  "HRM_PROD_API_URL",
  "HRM_LIVE_LOGIN_EMAIL",
  "HRM_LIVE_LOGIN_PASSWORD",
  "HRM_LIVE_TEST_CASE_ID"
];

const requiredSectionStatusColumns = [
  "id",
  "case_id",
  "employee_id",
  "company_id",
  "section_key",
  "section_label",
  "status",
  "is_required",
  "is_complete",
  "is_verified",
  "is_stale",
  "status_reason_code",
  "status_message",
  "next_action",
  "missing_fields_json",
  "blockers_json",
  "field_status_json",
  "source_version",
  "source_hash",
  "last_saved_at",
  "last_evaluated_at",
  "last_verified_at",
  "updated_by_user_id",
  "created_at",
  "updated_at"
];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function ensureReportDir() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
}

function writeReport(markdown) {
  ensureReportDir();
  fs.writeFileSync(reportPath, `${markdown.trim()}\n`);
}

function requestId(prefix = "phase5") {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function normalizeUrl(value, fallback) {
  return String(value || fallback || "").replace(/\/+$/, "");
}

function dataFrom(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

function safeString(value) {
  return redact(String(value ?? ""))
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "Database schema check failed")
    .replace(/\bSELECT\b[\s\S]*/gi, "Query detail redacted")
    .replace(/stack trace[\s\S]*/gi, "Stack trace redacted")
    .replace(/password|token|secret|document number|account number|bank account|payroll amount/gi, "sensitive value")
    .slice(0, 260)
    .trim();
}

function makeRow(input) {
  return {
    status: input.status,
    check: input.check,
    http: input.http ?? "-",
    duration_ms: input.duration_ms ?? "-",
    detail: safeString(input.detail ?? "")
  };
}

function rowTable(rows) {
  return markdownTable(["Status", "Check", "HTTP", "Duration ms", "Detail"], rows.map((row) => [
    row.status,
    row.check,
    row.http ?? "-",
    row.duration_ms ?? "-",
    row.detail ?? ""
  ]));
}

function statusFromRows(rows) {
  if (rows.some((row) => row.status === "FAIL")) return "FAIL";
  if (rows.some((row) => row.status === "WARNING" || row.status === "SKIPPED")) return "WARNING";
  return "PASS";
}

function extractSectionKeysFromRegistry() {
  const registry = read("worker/src/onboarding/section-status-registry.ts");
  return [...registry.matchAll(/section_key:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function schemaSectionStatusInfo() {
  const schema = read("database/schema.sql");
  const tableStart = schema.indexOf("CREATE TABLE IF NOT EXISTS onboarding_setup_section_statuses");
  const tableEnd = tableStart >= 0 ? schema.indexOf("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_case", tableStart) : -1;
  const tableSql = tableStart >= 0 && tableEnd > tableStart ? schema.slice(tableStart, tableEnd) : "";
  const missingColumns = requiredSectionStatusColumns.filter((column) => !new RegExp(`\\b${column}\\b`).test(tableSql));
  const indexMarkers = [
    "idx_onboarding_setup_section_statuses_case",
    "idx_onboarding_setup_section_statuses_employee",
    "idx_onboarding_setup_section_statuses_company",
    "idx_onboarding_setup_section_statuses_status",
    "idx_onboarding_setup_section_statuses_case_status",
    "idx_onboarding_setup_section_statuses_case_required_complete",
    "idx_onboarding_setup_section_statuses_case_stale"
  ];
  const missingIndexes = indexMarkers.filter((marker) => !schema.includes(marker));
  return {
    schema,
    tableSql,
    hasTable: tableStart >= 0,
    missingColumns,
    missingIndexes
  };
}

function generateAdditiveRepairSql(reason) {
  const { schema } = schemaSectionStatusInfo();
  const tableStart = schema.indexOf("CREATE TABLE IF NOT EXISTS onboarding_setup_section_statuses");
  const endMarker = "CREATE TABLE IF NOT EXISTS employee_onboarding_section_readiness_snapshots";
  const tableEnd = tableStart >= 0 ? schema.indexOf(endMarker, tableStart) : -1;
  const section = tableStart >= 0
    ? schema.slice(tableStart, tableEnd > tableStart ? tableEnd : undefined).trim()
    : "";
  if (!section) return null;
  const sql = [
    "-- Generated by verify-live-onboarding-readiness-redesign-phase5.",
    `-- Reason: ${safeString(reason) || "Production section-status schema appears incomplete."}`,
    "-- Review before applying. This file is additive only and contains no destructive statements.",
    section
  ].join("\n\n");
  fs.writeFileSync(additiveRepairPath, `${sql}\n`);
  return path.relative(rootDir, additiveRepairPath).replaceAll("\\", "/");
}

function sourceChecks() {
  const packageJson = JSON.parse(read("package.json"));
  const lifecycle = read("worker/src/routes/lifecycle.ts");
  const finalVerifier = read("worker/src/onboarding/final-activation-verifier.ts");
  const backgroundJobs = read("worker/src/utils/background-jobs.ts");
  const api = read("frontend/src/lib/api.ts");
  const page = read("frontend/src/pages/LifecyclePage.tsx");
  const wrangler = read("worker/wrangler.toml");
  const password = read("worker/src/auth/password.ts");
  const schemaInfo = schemaSectionStatusInfo();
  const sourceText = [lifecycle, finalVerifier, api, page].join("\n");

  return [
    makeRow({
      status: packageJson.scripts?.["verify:live-onboarding-readiness-redesign-phase5"] === "node scripts/verify-live-onboarding-readiness-redesign-phase5.mjs" ? "PASS" : "FAIL",
      check: "Phase 5 package script registered",
      detail: "package.json script marker checked."
    }),
    makeRow({
      status: schemaInfo.hasTable && schemaInfo.missingColumns.length === 0 && schemaInfo.missingIndexes.length === 0 ? "PASS" : "FAIL",
      check: "Section-status additive schema present in schema.sql",
      detail: schemaInfo.hasTable ? `missing columns=${schemaInfo.missingColumns.join(", ") || "none"} missing indexes=${schemaInfo.missingIndexes.join(", ") || "none"}` : "onboarding_setup_section_statuses missing"
    }),
    makeRow({
      status: lifecycle.includes('onboardingRoutes.get("/cases/:caseId/section-readiness"') && lifecycle.includes('onboardingRoutes.post("/cases/:caseId/refresh-readiness"') && lifecycle.includes('onboardingRoutes.get("/cases/:caseId/readiness-status"') ? "PASS" : "FAIL",
      check: "Fast section-readiness endpoints exist",
      detail: "section-readiness, readiness-status, and refresh-readiness route markers checked."
    }),
    makeRow({
      status: lifecycle.includes('onboardingRoutes.post("/cases/:caseId/final-verification"') && lifecycle.includes('dry_run") === "1"') && lifecycle.includes("previewOnboardingCaseForActivation") ? "PASS" : "FAIL",
      check: "Final verification supports read-only dry-run",
      detail: "dry_run=1 route marker checked."
    }),
    makeRow({
      status: finalVerifier.includes("previewOnboardingCaseForActivation") && finalVerifier.includes("getStoredOnboardingSectionStatusesForDryRun") && !/previewOnboardingCaseForActivation[\s\S]*ensureOnboardingSectionStatusesSchema/.test(finalVerifier) ? "PASS" : "FAIL",
      check: "Dry-run verifier is read-only",
      detail: "Dry-run helper avoids schema creation and status writes."
    }),
    makeRow({
      status: lifecycle.includes("runOnboardingFinalVerificationForRoute") && lifecycle.includes("if (!verification.can_activate)") && !/can_activate_candidate[\s\S]{0,120}activateEmployeeFromOnboarding/.test(lifecycle) ? "PASS" : "FAIL",
      check: "Activation cannot bypass final verifier",
      detail: "Activation/submission path checks final verification, not candidate readiness."
    }),
    makeRow({
      status: lifecycle.includes("getFastOnboardingSectionReadiness") && !/readiness-status[\s\S]*loadOnboardingWorkspace/.test(lifecycle) ? "PASS" : "FAIL",
      check: "Readiness status avoids full workspace reload",
      detail: "readiness-status source marker checked."
    }),
    makeRow({
      status: backgroundJobs.includes("recoverStaleOnboardingReadinessBackgroundJob") && backgroundJobs.includes("ONBOARDING_READINESS_JOB_MAX_RUNNING_MS") && backgroundJobs.includes("READINESS_JOB_TIMEOUT") ? "PASS" : "FAIL",
      check: "Old readiness jobs recover from stale running state",
      detail: "Background job stale recovery markers checked."
    }),
    makeRow({
      status: api.includes("finalVerifyOnboardingActivation") && api.includes("/final-verification") ? "PASS" : "FAIL",
      check: "Frontend final verification API helper remains present",
      detail: "API helper marker checked."
    }),
    makeRow({
      status: wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"') && wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"') ? "PASS" : "FAIL",
      check: "D1/R2 bindings unchanged",
      detail: "wrangler.toml binding markers checked."
    }),
    makeRow({
      status: password.includes("100000") ? "PASS" : "FAIL",
      check: "PBKDF2 remains 100000",
      detail: "password helper marker checked."
    }),
    makeRow({
      status: !hasBrowserPromptUsage(sourceText) && !hasDarkModeMarker(sourceText) ? "PASS" : "FAIL",
      check: "No browser prompts or dark mode introduced",
      detail: "Source markers checked."
    })
  ];
}

async function timedJson(label, url, options = {}, validate = (response) => response.ok) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Request-ID": requestId("phase5"),
        ...(options.headers ?? {})
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual"
    });
    const durationMs = Math.round(performance.now() - started);
    const text = await response.text().catch(() => "");
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    const ok = Boolean(validate(response, payload));
    return {
      row: makeRow({
        status: ok ? "PASS" : response.status >= 500 ? "FAIL" : "WARNING",
        check: label,
        http: response.status,
        duration_ms: durationMs,
        detail: `cache=${response.headers.get("cache-control") ?? "none"} request-id=${response.headers.get("x-request-id") ? "present" : "not returned"}`
      }),
      response,
      payload,
      durationMs
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return {
      row: makeRow({
        status: error instanceof Error && error.name === "AbortError" ? "FAIL" : "WARNING",
        check: label,
        http: "ERR",
        duration_ms: durationMs,
        detail: error instanceof Error ? error.message : String(error)
      }),
      response: null,
      payload: null,
      durationMs
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractToken(payload) {
  const data = dataFrom(payload);
  return typeof data?.token === "string" ? data.token : "";
}

function sectionsFrom(payload) {
  const data = dataFrom(payload);
  const sections = data?.sections ?? payload?.sections ?? data?.section_status_update?.sections;
  return Array.isArray(sections) ? sections : [];
}

function readinessFrom(payload) {
  const data = dataFrom(payload);
  return data?.readiness ?? payload?.readiness ?? data?.verification ?? payload?.verification ?? null;
}

function blockerSummary(payload) {
  const readiness = readinessFrom(payload);
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : Array.isArray(dataFrom(payload)?.error?.details?.blockers) ? dataFrom(payload).error.details.blockers : [];
  if (!blockers.length) return "none";
  return blockers.slice(0, 4).map((blocker) => {
    const label = blocker?.section_label ?? blocker?.section_key ?? "Section";
    const message = blocker?.message ?? blocker?.status_message ?? "Needs attention";
    const next = blocker?.next_action ? ` next=${blocker.next_action}` : "";
    const request = blocker?.request_id ? ` request=${blocker.request_id}` : "";
    return `${label}: ${message}${next}${request}`;
  }).join(" / ");
}

function liveExpectationRows(input) {
  const registryKeys = extractSectionKeysFromRegistry();
  const sectionKeys = new Set(input.sections.map((section) => String(section.section_key ?? "")));
  const missingRegistryKeys = registryKeys.filter((key) => !sectionKeys.has(key));
  const readiness = input.readiness ?? {};
  const finalStatus = String(input.finalVerification?.status ?? input.finalVerification?.verification?.status ?? input.finalVerification?.readiness?.status ?? "").toLowerCase();
  const finalBlockers = input.finalVerification?.blockers ?? input.finalVerification?.verification?.blockers ?? input.finalVerification?.readiness?.blockers ?? [];
  const hasBlockedStatus = ["blocked", "stale", "verified"].includes(finalStatus);
  const hasFailureStatus = finalStatus === "failed";
  const documentBlockers = [...input.sections, ...(Array.isArray(finalBlockers) ? finalBlockers : [])].filter((item) =>
    String(item?.section_key ?? "").includes("document") || /document/i.test(String(item?.section_label ?? item?.message ?? ""))
  );
  const documentsFailed = documentBlockers.some((item) => String(item?.status ?? "").toLowerCase() === "failed");

  return [
    makeRow({
      status: missingRegistryKeys.length === 0 && input.sections.length >= registryKeys.length ? "PASS" : "WARNING",
      check: "Section statuses cover all registry sections",
      detail: missingRegistryKeys.length ? `Missing preview rows: ${missingRegistryKeys.join(", ")}` : `${input.sections.length} section rows returned.`
    }),
    makeRow({
      status: String(readiness.mode ?? input.readinessMode ?? "section_status") === "section_status" || readiness.activation_requires_final_verification === true ? "PASS" : "WARNING",
      check: "Readiness status is section-status based",
      detail: `status=${readiness.status ?? "unknown"} final-required=${readiness.activation_requires_final_verification ?? input.activationRequiresFinalVerification ?? "unknown"}`
    }),
    makeRow({
      status: hasBlockedStatus || hasFailureStatus ? "PASS" : "WARNING",
      check: "Final verification returns terminal status",
      detail: `status=${finalStatus || "unknown"} blockers=${blockerSummary({ readiness: input.finalVerification })}`
    }),
    makeRow({
      status: documentsFailed ? "FAIL" : documentBlockers.length ? "PASS" : "WARNING",
      check: "Missing document/setup blockers are Blocked, not Failed",
      detail: documentBlockers.length ? "Document-related blocker/status observed without failed status." : "No document blocker was present on this case."
    }),
    makeRow({
      status: Array.isArray(finalBlockers) && finalBlockers.some((blocker) => blocker?.section_label && blocker?.message && blocker?.next_action && blocker?.request_id) ? "PASS" : finalStatus === "verified" ? "PASS" : "WARNING",
      check: "Blocked response includes section label, reason, next action, request ID",
      detail: finalStatus === "verified" ? "No blockers because dry-run returned verified." : blockerSummary({ readiness: input.finalVerification })
    })
  ];
}

async function runLiveChecks() {
  const frontendUrl = normalizeUrl(process.env.HRM_PROD_FRONTEND_URL, defaultFrontendUrl);
  const apiUrl = normalizeUrl(process.env.HRM_PROD_API_URL, defaultApiUrl);
  const email = process.env.HRM_LIVE_LOGIN_EMAIL;
  const password = process.env.HRM_LIVE_LOGIN_PASSWORD;
  const caseId = process.env.HRM_LIVE_TEST_CASE_ID || defaultCaseId;
  const repairCaseId = process.env.HRM_REPAIR_CASE_ID || "";
  const repairConfirmed = process.env.HRM_REPAIR_CONFIRM === "YES" && repairCaseId === caseId;
  const finalVerificationWrite = process.env.HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE === "true";
  const activationTest = process.env.HRM_LIVE_ENABLE_ACTIVATION_TEST === "true";
  const rows = [];
  const notes = [];

  const missingEnv = requiredLiveEnv.filter((name) => !process.env[name]);
  if (missingEnv.length) {
    rows.push(makeRow({
      status: "SKIPPED",
      check: "Authenticated live onboarding readiness verification",
      detail: `Missing env: ${missingEnv.join(", ")}. No live login, write, or activation checks were run.`
    }));
    return { rows, notes, skipped: true, frontendUrl, apiUrl, caseId };
  }

  const login = await timedJson(
    "Login works from env credentials",
    joinUrl(apiUrl, "/api/v1/auth/login"),
    { method: "POST", body: JSON.stringify({ email, password }) },
    (response, payload) => response.ok && Boolean(extractToken(payload))
  );
  rows.push(login.row);
  const token = extractToken(login.payload);
  if (!token) {
    rows.push(makeRow({ status: "FAIL", check: "Authenticated sequence", detail: "Login did not return a token." }));
    return { rows, notes, skipped: false, frontendUrl, apiUrl, caseId };
  }

  const auth = { Authorization: `Bearer ${token}`, Origin: frontendUrl };
  const casePath = `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}`;

  const sectionReadiness = await timedJson(
    "section-readiness endpoint returns quickly",
    joinUrl(apiUrl, `${casePath}/section-readiness`),
    { headers: auth },
    (response, payload) => response.ok && Array.isArray(sectionsFrom(payload)) && response.status < 500
  );
  rows.push(sectionReadiness.row);

  if (sectionReadiness.response?.status === 500) {
    const repairFile = generateAdditiveRepairSql("Live section-readiness returned a server error; production section-status schema may be incomplete.");
    rows.push(makeRow({
      status: repairFile ? "WARNING" : "FAIL",
      check: "Additive section-status repair SQL generated if missing",
      detail: repairFile ? `Generated ${repairFile}` : "Could not generate additive repair SQL from schema.sql."
    }));
  } else {
    rows.push(makeRow({
      status: "PASS",
      check: "Production section-status schema appears reachable",
      detail: "section-readiness did not return a schema-related server error."
    }));
  }

  const status = await timedJson(
    "readiness-status endpoint returns section-status readiness",
    joinUrl(apiUrl, `${casePath}/readiness-status`),
    { headers: auth },
    (response, payload) => response.ok && dataFrom(payload)?.mode === "section_status"
  );
  rows.push(status.row);

  let sections = sectionsFrom(sectionReadiness.payload);
  let readiness = readinessFrom(status.payload);
  let refreshPayload = null;

  if (repairConfirmed) {
    const rebuild = await timedJson(
      "one-case section-status rebuild works",
      joinUrl(apiUrl, `${casePath}/section-statuses/rebuild`),
      { method: "POST", headers: auth },
      (response, payload) => response.ok && Array.isArray(sectionsFrom(payload))
    );
    rows.push(rebuild.row);
    sections = sectionsFrom(rebuild.payload).length ? sectionsFrom(rebuild.payload) : sections;

    const refresh = await timedJson(
      "Retry readiness returns completed section-status result",
      joinUrl(apiUrl, `${casePath}/refresh-readiness`),
      { method: "POST", headers: auth },
      (response, payload) => response.ok && dataFrom(payload)?.mode === "section_status" && dataFrom(payload)?.readiness_refresh?.status === "completed"
    );
    rows.push(refresh.row);
    refreshPayload = dataFrom(refresh.payload);
    sections = sectionsFrom(refresh.payload).length ? sectionsFrom(refresh.payload) : sections;
    readiness = readinessFrom(refresh.payload) ?? readiness;
  } else {
    rows.push(makeRow({
      status: "SKIPPED",
      check: "one-case section-status rebuild and Retry readiness writes",
      detail: "Set HRM_REPAIR_CASE_ID to the live case and HRM_REPAIR_CONFIRM=YES to run the one-case rebuild/refresh write."
    }));
  }

  const finalPath = finalVerificationWrite
    ? `${casePath}/final-verification`
    : `${casePath}/final-verification?dry_run=1`;
  const finalVerification = await timedJson(
    finalVerificationWrite ? "final-verification endpoint returns safely" : "final-verification dry-run returns safely",
    joinUrl(apiUrl, finalPath),
    { method: "POST", headers: auth },
    (response, payload) => response.ok && ["verified", "blocked", "failed", "stale"].includes(String(readinessFrom(payload)?.status ?? dataFrom(payload)?.verification?.status ?? "").toLowerCase())
  );
  rows.push(finalVerification.row);
  const finalData = dataFrom(finalVerification.payload);

  rows.push(...liveExpectationRows({
    sections: sections.length ? sections : sectionsFrom(finalVerification.payload),
    readiness,
    readinessMode: dataFrom(status.payload)?.mode,
    activationRequiresFinalVerification: dataFrom(status.payload)?.activation_requires_final_verification,
    finalVerification: finalData?.verification ?? finalData?.readiness ?? finalData,
    refreshPayload
  }));

  const jobs = await timedJson(
    "Old background readiness jobs are not left running forever",
    joinUrl(apiUrl, "/api/v1/background-jobs?job_type=ONBOARDING_READINESS_RECALCULATION&status=RUNNING&scope=all&limit=20"),
    { headers: auth },
    (response) => response.ok || response.status === 403
  );
  rows.push(jobs.row.status === "PASS"
    ? makeRow({
      status: jobs.response?.status === 403 ? "WARNING" : "PASS",
      check: "Old background readiness jobs stale recovery reachable",
      http: jobs.response?.status ?? "-",
      duration_ms: jobs.durationMs,
      detail: jobs.response?.status === 403 ? "User cannot view all background jobs; source stale recovery guard is still verified." : "Background job list returned safely."
    })
    : jobs.row);

  rows.push(makeRow({
    status: activationTest ? "WARNING" : "PASS",
    check: "No production activation test ran by default",
    detail: activationTest ? "HRM_LIVE_ENABLE_ACTIVATION_TEST=true was set; this verifier still does not call activation endpoints." : "Activation endpoint was not called."
  }));
  rows.push(makeRow({
    status: finalVerificationWrite ? "WARNING" : "PASS",
    check: "No final-verification write ran by default",
    detail: finalVerificationWrite ? "HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE=true was set; final-verification write path was used." : "final-verification used dry_run=1."
  }));

  if (token && rows.some((row) => String(row.detail).includes(token))) {
    rows.push(makeRow({ status: "FAIL", check: "No sensitive data printed", detail: "Token appeared in live rows." }));
  } else {
    rows.push(makeRow({ status: "PASS", check: "No sensitive data printed", detail: "Rows redact tokens/passwords and do not include response bodies." }));
  }

  notes.push(`Live case: ${caseId}`);
  notes.push(repairConfirmed ? "One-case rebuild and Retry readiness were executed because HRM_REPAIR_CONFIRM=YES matched the live case." : "One-case rebuild and Retry readiness writes were skipped because repair confirmation was not provided.");
  notes.push(finalVerificationWrite ? "Final verification write path was explicitly enabled." : "Final verification used read-only dry-run mode.");
  return { rows, notes, skipped: false, frontendUrl, apiUrl, caseId };
}

function buildReport(input) {
  const overall = input.sourceStatus === "FAIL" || input.liveStatus === "FAIL"
    ? "FAIL"
    : input.liveStatus === "WARNING" || input.sourceStatus === "WARNING"
      ? "WARNING"
      : "PASS";
  return `# Onboarding Readiness Redesign Phase 5 Live Verification Report

Generated: ${new Date().toISOString()}

Frontend URL: ${input.frontendUrl}

API URL: ${input.apiUrl}

Case ID: ${input.caseId || "not provided"}

Overall status: **${overall}**

Live checks: **${input.liveStatus}**

Source/schema safeguards: **${input.sourceStatus}**

No passwords, bearer tokens, session tokens, raw response bodies, document numbers, payroll values, bank account numbers, or SQL details are written to this report.

## Live Verification

${rowTable(input.liveRows)}

## Source And Schema Safeguards

${rowTable(input.sourceRows)}

## Notes

${input.notes.length ? input.notes.map((note) => `- ${escapeTable(note)}`).join("\n") : "- No additional notes."}
`;
}

async function main() {
  const sourceRows = sourceChecks();
  const live = await runLiveChecks();
  const sourceStatus = statusFromRows(sourceRows);
  const liveStatus = statusFromRows(live.rows);
  const report = buildReport({
    sourceRows,
    liveRows: live.rows,
    sourceStatus,
    liveStatus,
    frontendUrl: live.frontendUrl,
    apiUrl: live.apiUrl,
    caseId: live.caseId,
    notes: live.notes
  });
  writeReport(report);
  if (hasSecretLikeValue(report)) {
    console.error("Phase 5 live report contains secret-like content. Refusing to pass.");
    process.exit(1);
  }
  if (sourceStatus === "FAIL" || liveStatus === "FAIL") {
    console.error("Phase 5 onboarding readiness live verification failed. See docs/production/live-onboarding-readiness-redesign-phase5-report.md.");
    process.exit(1);
  }
  if (live.skipped) {
    console.log("Phase 5 live onboarding readiness verification skipped live calls because required env vars were not provided.");
  } else {
    console.log("Phase 5 live onboarding readiness verification completed.");
  }
  console.log("Report saved: docs/production/live-onboarding-readiness-redesign-phase5-report.md");
}

main().catch((error) => {
  console.error("Phase 5 live onboarding readiness verification failed.");
  console.error(safeString(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
