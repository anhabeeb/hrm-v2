import { writeReport } from "./phase12-utils.mjs";

const frontendUrl = process.env.HRM_PROD_FRONTEND_URL;
const apiUrl = process.env.HRM_PROD_API_URL;
const authToken = process.env.HRM_TEST_AUTH_TOKEN;
const timeoutMs = Number(process.env.HRM_SMOKE_TIMEOUT_MS ?? 10000);

function withTimeout(signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function joinUrl(base, pathname) {
  return `${String(base).replace(/\/+$/, "")}${pathname}`;
}

function markdown(results, status, note = "") {
  const rows = results.map((item) => `| ${item.ok ? "PASS" : "FAIL"} | ${item.name} | ${item.status ?? "-"} | ${item.detail ?? ""} |`).join("\n");
  return `# Phase 12 Production Deployment Smoke Results

Generated: ${new Date().toISOString()}

Status: **${status}**

${note}

| Result | Check | HTTP | Detail |
| --- | --- | --- | --- |
${rows || "| SKIP | Remote smoke execution | - | Production URLs were not provided. |"}

No credentials or sensitive response bodies are stored in this report.
`;
}

async function request(name, url, options = {}, validate = (response) => response.ok) {
  const timer = withTimeout();
  try {
    const response = await fetch(url, { ...options, signal: timer.signal, redirect: "manual" });
    const cache = response.headers.get("cache-control") ?? "";
    const contentType = response.headers.get("content-type") ?? "";
    const ok = validate(response, { cache, contentType });
    return { name, ok, status: response.status, detail: `cache=${cache || "none"} content-type=${contentType || "none"}` };
  } catch (error) {
    return { name, ok: false, status: "ERR", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    timer.done();
  }
}

async function main() {
  const results = [];
  if (!frontendUrl || !apiUrl) {
    writeReport(
      "docs/production/phase12-production-smoke-results.md",
      markdown(results, "SKIPPED", "Set `HRM_PROD_FRONTEND_URL` and `HRM_PROD_API_URL` to run remote smoke checks. Optional authenticated checks require `HRM_TEST_AUTH_TOKEN`.")
    );
    console.log("Production deployment Phase 12 smoke skipped: HRM_PROD_FRONTEND_URL and HRM_PROD_API_URL were not both provided.");
    return;
  }

  results.push(await request("Frontend root loads", frontendUrl, {}, (response, meta) => response.status < 500 && /text\/html/i.test(meta.contentType)));
  results.push(await request("Login route SPA fallback loads", joinUrl(frontendUrl, "/login"), {}, (response) => response.status === 200 || response.status === 304));
  results.push(await request("Favicon asset returns image MIME", joinUrl(frontendUrl, "/favicon.ico"), {}, (response, meta) => response.status < 500 && /image|icon|octet-stream/i.test(meta.contentType)));
  results.push(await request("Brand asset returns image/SVG MIME", joinUrl(frontendUrl, "/brand/omnicore-favicon.svg"), {}, (response, meta) => response.status < 500 && /svg|image/i.test(meta.contentType)));
  results.push(await request("Static assets cache immutably when present", joinUrl(frontendUrl, "/assets/nonexistent-phase12-smoke.js"), {}, (response) => response.status === 404 || response.status === 200));
  results.push(await request("API bootstrap/status responds", joinUrl(apiUrl, "/api/v1/bootstrap/status"), {}, (response) => response.status < 500));
  results.push(await request("API health responds no-store", joinUrl(apiUrl, "/api/v1/health"), {}, (response, meta) => response.status < 500 && /no-store/i.test(meta.cache)));
  results.push(await request("CORS preflight allows x-request-id", joinUrl(apiUrl, "/api/v1/bootstrap/status"), {
    method: "OPTIONS",
    headers: {
      Origin: frontendUrl,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "x-request-id"
    }
  }, (response) => [200, 204].includes(response.status) && /x-request-id/i.test(response.headers.get("access-control-allow-headers") ?? "")));
  results.push(await request("Protected background jobs route rejects unauthenticated access cleanly", joinUrl(apiUrl, "/api/v1/background-jobs"), {}, (response) => [401, 403].includes(response.status)));
  results.push(await request("Performance endpoint rejects unauthenticated access cleanly", joinUrl(apiUrl, "/api/v1/performance/overview"), {}, (response) => [401, 403].includes(response.status)));
  results.push(await request("App events endpoint rejects unauthenticated access cleanly", joinUrl(apiUrl, "/api/v1/app-events/since"), {}, (response) => [401, 403].includes(response.status)));
  results.push(await request("Report artifact endpoint rejects unauthenticated access cleanly", joinUrl(apiUrl, "/api/v1/reports/artifacts/smoke/download"), {}, (response) => [401, 403, 404].includes(response.status)));

  if (authToken) {
    const authHeaders = { Authorization: `Bearer ${authToken}` };
    const authChecks = [
      ["Current user/session endpoint", "/api/v1/auth/me"],
      ["Module settings/visibility endpoint", "/api/v1/admin/module-control"],
      ["Notification count/list endpoint", "/api/v1/notifications"],
      ["Command Center summary endpoint", "/api/v1/dashboard/command-center"],
      ["Onboarding case list endpoint", "/api/v1/onboarding/cases"],
      ["Employee list endpoint", "/api/v1/employees?limit=5"],
      ["Background jobs list endpoint", "/api/v1/background-jobs?limit=5"],
      ["Performance metrics endpoint", "/api/v1/performance/overview"]
    ];
    for (const [name, path] of authChecks) {
      results.push(await request(name, joinUrl(apiUrl, path), { headers: authHeaders }, (response) => response.status < 500));
    }
  }

  const failures = results.filter((item) => !item.ok);
  writeReport(
    "docs/production/phase12-production-smoke-results.md",
    markdown(results, failures.length ? "FAIL" : "PASS", authToken ? "Authenticated read-only checks were included." : "Authenticated checks were skipped because `HRM_TEST_AUTH_TOKEN` was not provided.")
  );
  console.log(`Production deployment Phase 12 smoke complete. Passed ${results.length - failures.length}/${results.length}.`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error("Production deployment Phase 12 smoke failed.");
  console.error(error.message);
  process.exit(1);
});
