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
const reportPath = path.join(rootDir, "docs", "production", "live-authenticated-performance-report.md");
const timeoutMs = Math.max(1000, Number(process.env.HRM_LIVE_VERIFY_TIMEOUT_MS ?? 15000));
const requiredEnv = [
  "HRM_PROD_FRONTEND_URL",
  "HRM_PROD_API_URL",
  "HRM_LIVE_LOGIN_EMAIL",
  "HRM_LIVE_LOGIN_PASSWORD"
];

const thresholds = {
  login: 2000,
  commandCenter: 2000,
  employeeList: 2000,
  onboardingCaseList: 2000,
  onboardingWorkspace: 3000,
  saveCommit: 2000
};

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

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function statusForDuration(durationMs, thresholdMs, ok) {
  if (!ok) return "FAIL";
  if (!thresholdMs) return "PASS";
  return durationMs <= thresholdMs ? "PASS" : "WARNING";
}

function safeHeaders(response) {
  return {
    cache: response.headers.get("cache-control") ?? "",
    corsAllowHeaders: response.headers.get("access-control-allow-headers") ?? "",
    corsAllowOrigin: response.headers.get("access-control-allow-origin") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    requestId: response.headers.get("x-request-id") ?? response.headers.get("x-requestid") ?? "",
    serverTiming: response.headers.get("server-timing") ?? "",
    vary: response.headers.get("vary") ?? ""
  };
}

function makeRow(input) {
  return {
    status: input.status,
    check: input.check,
    http: input.http ?? "-",
    duration_ms: input.duration_ms ?? "-",
    threshold_ms: input.threshold_ms ?? "-",
    detail: redact(input.detail ?? "")
  };
}

function rowTable(rows) {
  return markdownTable(["Status", "Check", "HTTP", "Duration ms", "Threshold ms", "Detail"], rows.map((row) => [
    row.status,
    row.check,
    row.http,
    row.duration_ms,
    row.threshold_ms,
    row.detail
  ]));
}

async function timedFetchJson(label, url, options = {}, validate = (response) => response.ok, thresholdMs = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Request-ID": requestId(),
        ...(options.headers ?? {})
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual"
    });
    const durationMs = Math.round(performance.now() - started);
    const headers = safeHeaders(response);
    let payload = null;
    const text = await response.text().catch(() => "");
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    const ok = Boolean(validate(response, payload, headers));
    return {
      row: makeRow({
        status: statusForDuration(durationMs, thresholdMs, ok),
        check: label,
        http: response.status,
        duration_ms: durationMs,
        threshold_ms: thresholdMs || "-",
        detail: `cache=${headers.cache || "none"} type=${headers.contentType || "none"} request-id=${headers.requestId ? "present" : "not returned"}`
      }),
      response,
      headers,
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
        threshold_ms: thresholdMs || "-",
        detail: error instanceof Error ? error.message : String(error)
      }),
      response: null,
      headers: {},
      payload: null,
      durationMs
    };
  } finally {
    clearTimeout(timer);
  }
}

async function timedFetchRaw(label, url, options = {}, validate = (response) => response.status < 500, thresholdMs = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Request-ID": requestId(),
        ...(options.headers ?? {})
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual"
    });
    const durationMs = Math.round(performance.now() - started);
    const headers = safeHeaders(response);
    const ok = Boolean(validate(response, headers));
    await response.body?.cancel().catch(() => undefined);
    return {
      row: makeRow({
        status: statusForDuration(durationMs, thresholdMs, ok),
        check: label,
        http: response.status,
        duration_ms: durationMs,
        threshold_ms: thresholdMs || "-",
        detail: `cors-origin=${headers.corsAllowOrigin || "none"} allow-headers=${headers.corsAllowHeaders ? "present" : "none"} cache=${headers.cache || "none"}`
      }),
      response,
      headers,
      durationMs
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return {
      row: makeRow({
        status: error instanceof Error && error.name === "AbortError" ? "WARNING" : "FAIL",
        check: label,
        http: "ERR",
        duration_ms: durationMs,
        threshold_ms: thresholdMs || "-",
        detail: error instanceof Error ? error.message : String(error)
      }),
      response: null,
      headers: {},
      durationMs
    };
  } finally {
    clearTimeout(timer);
  }
}

function dataFrom(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

function sourceChecks() {
  const lifecycle = read("frontend/src/pages/LifecyclePage.tsx");
  const api = read("frontend/src/lib/api.ts");
  const appEvents = read("frontend/src/lib/appEventsApi.ts");
  const preload = read("frontend/src/lib/preloadReferenceData.ts");
  const workerLifecycle = read("worker/src/routes/lifecycle.ts");
  const cors = read("worker/src/utils/cors.ts");
  const files = [lifecycle, api, appEvents, preload, workerLifecycle, cors].join("\n");
  return [
    makeRow({
      status: api.includes("getOnboardingWorkspaceSaveStatus") && workerLifecycle.includes("/cases/:caseId/save-status") ? "PASS" : "FAIL",
      check: "Save-status reconciliation path exists",
      detail: "Frontend API and Worker endpoint markers checked."
    }),
    makeRow({
      status: lifecycle.includes("isOnboardingSaveTimeoutError") && lifecycle.includes("Save timed out. Checking whether your changes were saved") ? "PASS" : "FAIL",
      check: "Save timeout reconciliation UI path exists",
      detail: "Timeout handling checks save-status before asking user to retry."
    }),
    makeRow({
      status: lifecycle.includes("refreshing") && lifecycle.includes("failed") && lifecycle.includes("stale") && lifecycle.includes("ready") && lifecycle.includes("blocked") ? "PASS" : "FAIL",
      check: "Readiness terminal and transitional states are represented",
      detail: "Ready, blocked, refreshing, stale, and failed state markers checked."
    }),
    makeRow({
      status: lifecycle.includes("retry") && lifecycle.includes("optional_section_states") ? "PASS" : "FAIL",
      check: "Optional onboarding sections expose retry/state handling",
      detail: "Optional section state and retry markers checked."
    }),
    makeRow({
      status: preload.includes("canPreloadPaymentInstitutions") && preload.includes("moduleEnabled(user, \"payroll_payment_institutions\")") ? "PASS" : "FAIL",
      check: "Payment institutions preload is permission/module gated",
      detail: "Preload guard prevents unauthorized optional preload spam."
    }),
    makeRow({
      status: appEvents.includes("X-Request-ID") && cors.includes("x-request-id") ? "PASS" : "FAIL",
      check: "Request id header is preserved for app-events/CORS",
      detail: "Frontend stream client and Worker CORS allow-list checked."
    }),
    makeRow({
      status: hasBrowserPromptUsage(files) ? "FAIL" : "PASS",
      check: "No browser alert/confirm/prompt in touched verification areas",
      detail: "Static source scan."
    }),
    makeRow({
      status: hasDarkModeMarker(files) ? "FAIL" : "PASS",
      check: "No dark mode markers introduced",
      detail: "Static source scan."
    })
  ];
}

function summarizeWorkspacePayload(workspaceData, workspaceDuration) {
  const workspace = workspaceData?.workspace && typeof workspaceData.workspace === "object" ? workspaceData.workspace : workspaceData;
  const row = (name, ok, detail) => makeRow({
    status: ok ? "PASS" : "WARNING",
    check: name,
    duration_ms: workspaceDuration,
    threshold_ms: thresholds.onboardingWorkspace,
    detail
  });
  if (!workspace || typeof workspace !== "object") {
    return [
      makeRow({
        status: "WARNING",
        check: "Onboarding workspace payload shape",
        duration_ms: workspaceDuration,
        threshold_ms: thresholds.onboardingWorkspace,
        detail: "Workspace payload was not available for section checks."
      })
    ];
  }
  const sections = workspace.sections && typeof workspace.sections === "object" ? workspace.sections : {};
  return [
    row("Onboarding workspace core employee/case payload", Boolean(workspace.case || workspace.employee), "Checks case/employee objects in workspace payload."),
    row("Onboarding workspace documents section payload", Boolean(workspace.documents || workspace.document_checklist || sections.documents), "Checks documents/document checklist slice availability."),
    row("Onboarding workspace payroll/payment section payload", Boolean(workspace.payroll || workspace.payment_method || workspace.pension || sections.payroll), "Checks payroll/payment/pension slice availability."),
    row("Onboarding workspace readiness payload", Boolean(workspace.readiness), "Checks readiness slice availability."),
    row("Onboarding workspace does not depend on optional sections for core payload", Boolean(workspace.case || workspace.employee), "Core payload presence is treated as display-first signal.")
  ];
}

function buildReport(input) {
  const liveStatus = input.liveRows.some((row) => row.status === "FAIL") ? "FAIL"
    : input.liveRows.some((row) => row.status === "WARNING" || row.status === "SKIPPED") ? "WARNING"
      : "PASS";
  const sourceStatus = input.sourceRows.some((row) => row.status === "FAIL") ? "FAIL" : "PASS";
  const overall = input.skipped ? "SKIPPED" : liveStatus === "FAIL" || sourceStatus === "FAIL" ? "FAIL" : liveStatus === "WARNING" ? "WARNING" : "PASS";
  return `# Live Authenticated Performance Report

Generated: ${new Date().toISOString()}

Frontend URL: ${input.frontendUrl || defaultFrontendUrl}

API URL: ${input.apiUrl || defaultApiUrl}

Overall status: **${overall}**

Credentials: ${input.credentialsAvailable ? "provided through environment variables" : "not provided; live authenticated checks skipped"}

Save test: ${input.saveTestSummary}

No password, bearer token, session token, response body, or sensitive HR/payroll/document data is written to this report.

## Live Measurements

${rowTable(input.liveRows)}

## Source Safeguards

${rowTable(input.sourceRows)}

## Notes

${input.notes.map((note) => `- ${escapeTable(note)}`).join("\n")}
`;
}

async function main() {
  const frontendUrl = normalizeUrl(process.env.HRM_PROD_FRONTEND_URL);
  const apiUrl = normalizeUrl(process.env.HRM_PROD_API_URL);
  const email = process.env.HRM_LIVE_LOGIN_EMAIL;
  const password = process.env.HRM_LIVE_LOGIN_PASSWORD;
  const caseId = process.env.HRM_LIVE_TEST_CASE_ID;
  const enableSaveTest = process.env.HRM_LIVE_ENABLE_SAVE_TEST === "true";
  const missingEnv = requiredEnv.filter((name) => !process.env[name]);
  const sourceRows = sourceChecks();
  const liveRows = [];
  const notes = [
    "Live write/save checks are disabled unless `HRM_LIVE_ENABLE_SAVE_TEST=true` is set.",
    "When save testing is enabled, use a dedicated test onboarding case only.",
    "Thresholds: login, command center, employee list, and onboarding case list under 2 seconds; workspace core under 3 seconds."
  ];

  if (missingEnv.length > 0) {
    liveRows.push(makeRow({
      status: "SKIPPED",
      check: "Authenticated live verification",
      detail: `Missing environment variables: ${missingEnv.join(", ")}`
    }));
    writeReport(buildReport({
      frontendUrl,
      apiUrl,
      credentialsAvailable: false,
      liveRows,
      sourceRows,
      skipped: true,
      saveTestSummary: "SKIPPED - live credentials were not provided.",
      notes
    }));
    console.log("Live authenticated performance verification skipped: required environment variables were not provided.");
    return;
  }

  let token = "";
  const login = await timedFetchJson(
    "Login API",
    joinUrl(apiUrl, "/api/v1/auth/login"),
    {
      method: "POST",
      body: JSON.stringify({ email, password })
    },
    (response, payload) => response.ok && typeof dataFrom(payload)?.token === "string",
    thresholds.login
  );
  liveRows.push(login.row);
  token = String(dataFrom(login.payload)?.token ?? "");
  if (!token) {
    liveRows.push(makeRow({ status: "FAIL", check: "Authenticated sequence", detail: "Login did not return a token; no further authenticated checks were run." }));
    writeReport(buildReport({
      frontendUrl,
      apiUrl,
      credentialsAvailable: true,
      liveRows,
      sourceRows,
      skipped: false,
      saveTestSummary: "SKIPPED - login failed.",
      notes
    }));
    console.log("Live authenticated performance verification failed before authenticated checks.");
    process.exitCode = 1;
    return;
  }

  const auth = { Authorization: `Bearer ${token}`, Origin: frontendUrl };
  const authenticatedChecks = [
    ["Current user/session", "/api/v1/auth/me", thresholds.login, (response) => response.ok],
    ["Bootstrap/status", "/api/v1/bootstrap/status", thresholds.login, (response) => response.status < 500],
    ["Command Center summary", "/api/v1/dashboard/command-center-summary", thresholds.commandCenter, (response) => response.ok],
    ["Employee list", "/api/v1/employees?limit=10&page=1", thresholds.employeeList, (response) => response.ok || response.status === 403],
    ["Onboarding case list", "/api/v1/onboarding/cases?limit=10&page=1", thresholds.onboardingCaseList, (response) => response.ok || response.status === 403],
    ["Notification unread-count", "/api/v1/notifications/unread-count", thresholds.login, (response) => response.status !== 503 && response.status < 500],
    ["App events since", "/api/v1/app-events/since?limit=5", thresholds.login, (response) => response.ok || response.status === 403],
    ["App events stream status", "/api/v1/app-events/stream?status=1", thresholds.login, (response) => response.status < 500],
    ["Payment institutions optional direct endpoint", "/api/v1/payroll/payment-institutions", thresholds.login, (response) => response.status < 500],
    ["Pension schemes optional direct endpoint", "/api/v1/payroll/pension-schemes", thresholds.login, (response) => response.status < 500]
  ];

  for (const [label, pathname, threshold, validate] of authenticatedChecks) {
    const result = await timedFetchJson(label, joinUrl(apiUrl, pathname), { headers: auth }, validate, threshold);
    liveRows.push(result.row);
  }

  const preflight = await timedFetchRaw(
    "App events stream CORS preflight",
    joinUrl(apiUrl, "/api/v1/app-events/stream"),
    {
      method: "OPTIONS",
      headers: {
        Origin: frontendUrl,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization, x-request-id, last-event-id"
      },
      timeoutMs: 5000
    },
    (response, headers) => [200, 204].includes(response.status)
      && /x-request-id/i.test(headers.corsAllowHeaders)
      && headers.corsAllowOrigin === frontendUrl
      && /origin/i.test(headers.vary),
    thresholds.login
  );
  liveRows.push(preflight.row);

  const streamAttempt = await timedFetchRaw(
    "App events stream connection attempt",
    joinUrl(apiUrl, "/api/v1/app-events/stream"),
    {
      headers: {
        ...auth,
        Accept: "text/event-stream"
      },
      timeoutMs: 5000
    },
    (response, headers) => response.status < 500 && /text\/event-stream|json|text/i.test(headers.contentType || "text/event-stream"),
    thresholds.login
  );
  liveRows.push(streamAttempt.row);

  if (caseId) {
    const workspaceResult = await timedFetchJson(
      "Onboarding workspace open",
      joinUrl(apiUrl, `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}/workspace`),
      { headers: auth, timeoutMs: 20000 },
      (response) => response.ok || response.status === 403,
      thresholds.onboardingWorkspace
    );
    liveRows.push(workspaceResult.row);
    liveRows.push(...summarizeWorkspacePayload(dataFrom(workspaceResult.payload), workspaceResult.durationMs));

    const readiness = await timedFetchJson(
      "Onboarding readiness status",
      joinUrl(apiUrl, `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}/readiness`),
      { headers: auth, timeoutMs: 12000 },
      (response) => response.ok || response.status === 403,
      thresholds.onboardingWorkspace
    );
    liveRows.push(readiness.row);

    const saveStatus = await timedFetchJson(
      "Onboarding save-status endpoint",
      joinUrl(apiUrl, `/api/v1/onboarding/cases/${encodeURIComponent(caseId)}/save-status?request_id=live-verification-${encodeURIComponent(requestId())}`),
      { headers: auth, timeoutMs: 8000 },
      (response) => response.ok || response.status === 404 || response.status === 403,
      thresholds.login
    );
    liveRows.push(saveStatus.row);
  } else {
    liveRows.push(makeRow({
      status: "SKIPPED",
      check: "Onboarding workspace detail",
      detail: "`HRM_LIVE_TEST_CASE_ID` was not provided."
    }));
  }

  let saveTestSummary = "SKIPPED - `HRM_LIVE_ENABLE_SAVE_TEST` is not true.";
  if (enableSaveTest) {
    if (!caseId) {
      saveTestSummary = "SKIPPED - save test requested but `HRM_LIVE_TEST_CASE_ID` was not provided.";
      liveRows.push(makeRow({ status: "SKIPPED", check: "Onboarding save write test", detail: saveTestSummary }));
    } else if (process.env.HRM_LIVE_SAVE_TEST_CONFIRM !== "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION") {
      saveTestSummary = "SKIPPED - save test requires `HRM_LIVE_SAVE_TEST_CONFIRM=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION`.";
      liveRows.push(makeRow({ status: "SKIPPED", check: "Onboarding save write test", detail: saveTestSummary }));
    } else {
      saveTestSummary = "SKIPPED - no no-op-safe onboarding write field is configured in this verifier.";
      liveRows.push(makeRow({ status: "SKIPPED", check: "Onboarding save write test", detail: saveTestSummary }));
    }
  }

  const privateNoStoreWarnings = liveRows.filter((row) => /cache=public/i.test(row.detail));
  if (privateNoStoreWarnings.length > 0) {
    liveRows.push(makeRow({ status: "FAIL", check: "Authenticated API cache safety", detail: "One or more authenticated API responses were public cached." }));
  } else {
    liveRows.push(makeRow({ status: "PASS", check: "Authenticated API cache safety", detail: "No public cache marker was observed in measured authenticated API rows." }));
  }

  writeReport(buildReport({
    frontendUrl,
    apiUrl,
    credentialsAvailable: true,
    liveRows,
    sourceRows,
    skipped: false,
    saveTestSummary,
    notes
  }));

  const reportText = fs.readFileSync(reportPath, "utf8");
  if (hasSecretLikeValue(reportText) || reportText.includes(password) || reportText.includes(token)) {
    throw new Error("Live verification report contains a secret-like value.");
  }
  if (liveRows.some((row) => row.status === "FAIL") || sourceRows.some((row) => row.status === "FAIL")) {
    console.log("Live authenticated performance verification completed with failures. See docs/production/live-authenticated-performance-report.md.");
    process.exitCode = 1;
    return;
  }
  console.log("Live authenticated performance verification complete. See docs/production/live-authenticated-performance-report.md.");
}

main().catch((error) => {
  console.error("Live authenticated performance verification failed unexpectedly.");
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
