import { writeReport } from "./phase12-utils.mjs";

const apiUrl = process.env.HRM_LOADTEST_API_URL || process.env.HRM_PROD_API_URL;
const authToken = process.env.HRM_TEST_AUTH_TOKEN;
const enableWrites = process.env.HRM_LOADTEST_ENABLE_WRITES === "true";
const profile = (process.env.HRM_LOADTEST_PROFILE ?? "low").toLowerCase();
const requestCount = Math.max(1, Number(process.env.HRM_LOADTEST_REQUESTS ?? 30));
const timeoutMs = Math.max(1000, Number(process.env.HRM_LOADTEST_TIMEOUT_MS ?? 10000));

const concurrencyByProfile = { low: 2, medium: 5, high: 10 };
const concurrency = concurrencyByProfile[profile] ?? concurrencyByProfile.low;

function joinUrl(base, pathname) {
  return `${String(base).replace(/\/+$/, "")}${pathname}`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function routeKey(pathname) {
  return pathname.replace(/[0-9a-f]{8,}(?:-[0-9a-f]{4,})*/gi, ":id").replace(/\?.*$/, "");
}

function markdown(summary, status, note = "") {
  const rows = summary.routes
    .map((item) => `| ${item.route} | ${item.count} | ${item.error_rate.toFixed(2)}% | ${item.p50_ms} | ${item.p95_ms} | ${item.p99_ms} | ${item.avg_payload_bytes} |`)
    .join("\n");
  return `# Phase 12 Load Test Results

Generated: ${new Date().toISOString()}

Status: **${status}**

${note}

Mode: ${enableWrites ? "writes explicitly enabled" : "read-only"}

Profile: ${profile}

Concurrency: ${concurrency}

Total requests: ${summary.total_requests}

Overall error rate: ${summary.error_rate.toFixed(2)}%

Timeouts: ${summary.timeout_count}

| Route | Count | Error Rate | p50 ms | p95 ms | p99 ms | Avg Payload Bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows || "| skipped | 0 | 0.00% | 0 | 0 | 0 | 0 |"}

No response bodies, credentials, or sensitive HR/payroll/document data are stored in this report.
`;
}

async function timedFetch(pathname, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(joinUrl(apiUrl, pathname), {
      headers,
      signal: controller.signal
    });
    const buffer = await response.arrayBuffer();
    return {
      route: routeKey(pathname),
      ok: response.status < 500,
      status: response.status,
      duration: Date.now() - started,
      payloadBytes: buffer.byteLength,
      timeout: false,
      serverTiming: response.headers.get("server-timing") ?? "",
      cache: response.headers.get("cache-control") ?? ""
    };
  } catch (error) {
    return {
      route: routeKey(pathname),
      ok: false,
      status: "ERR",
      duration: Date.now() - started,
      payloadBytes: 0,
      timeout: error instanceof Error && error.name === "AbortError",
      serverTiming: "",
      cache: ""
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(tasks) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      results.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function summarize(results) {
  const groups = new Map();
  for (const result of results) {
    if (!groups.has(result.route)) groups.set(result.route, []);
    groups.get(result.route).push(result);
  }
  const routes = [...groups.entries()].map(([route, rows]) => {
    const durations = rows.map((row) => row.duration);
    const errors = rows.filter((row) => !row.ok).length;
    return {
      route,
      count: rows.length,
      error_rate: rows.length ? (errors / rows.length) * 100 : 0,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      p99_ms: percentile(durations, 99),
      avg_payload_bytes: Math.round(rows.reduce((sum, row) => sum + row.payloadBytes, 0) / rows.length)
    };
  });
  const errors = results.filter((row) => !row.ok).length;
  return {
    total_requests: results.length,
    error_rate: results.length ? (errors / results.length) * 100 : 0,
    timeout_count: results.filter((row) => row.timeout).length,
    routes
  };
}

async function main() {
  if (!apiUrl) {
    writeReport("docs/production/phase12-load-test-results.md", markdown({ total_requests: 0, error_rate: 0, timeout_count: 0, routes: [] }, "SKIPPED", "Set `HRM_LOADTEST_API_URL` or `HRM_PROD_API_URL` to run the read-only load test."));
    console.log("Phase 12 load test skipped: no target API URL was provided.");
    return;
  }
  if (enableWrites && process.env.HRM_LOADTEST_TEST_TENANT !== "true") {
    throw new Error("Write load tests require HRM_LOADTEST_TEST_TENANT=true. No production writes were executed.");
  }

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const publicPaths = ["/api/v1/bootstrap/status", "/api/v1/health"];
  const authenticatedPaths = authToken ? [
    "/api/v1/auth/me",
    "/api/v1/dashboard/command-center",
    "/api/v1/employees?limit=10",
    "/api/v1/onboarding/cases?limit=10",
    "/api/v1/documents/missing?limit=10",
    "/api/v1/notifications?limit=10",
    "/api/v1/background-jobs?limit=10",
    "/api/v1/performance/overview",
    "/api/v1/search/global?q=test&limit=5"
  ] : [];
  const paths = [...publicPaths, ...authenticatedPaths];
  const tasks = Array.from({ length: requestCount }, (_, index) => {
    const pathname = paths[index % paths.length];
    return () => timedFetch(pathname, headers);
  });

  const results = await runPool(tasks);
  const summary = summarize(results);
  const status = summary.error_rate > 1 || summary.timeout_count > 0 ? "REVIEW" : "PASS";
  writeReport("docs/production/phase12-load-test-results.md", markdown(summary, status, authToken ? "Authenticated read-only scenarios were included." : "Only public read-only scenarios ran because no auth token was provided."));
  console.log(`Phase 12 load test complete. Requests: ${summary.total_requests}. Error rate: ${summary.error_rate.toFixed(2)}%.`);
  if (status === "REVIEW" && process.env.HRM_LOADTEST_STRICT === "true") process.exit(1);
}

main().catch((error) => {
  console.error("Phase 12 load test failed.");
  console.error(error.message);
  process.exit(1);
});
