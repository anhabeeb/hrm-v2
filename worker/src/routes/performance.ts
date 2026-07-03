import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser } from "../types";
import { fail, ok } from "../utils/http";
import { paginationMeta, parsePaginationParams } from "../utils/pagination";
import {
  cleanupPerformanceMetrics,
  type FrontendPerformanceMetricInput,
  recordFrontendPerformanceMetrics,
  syncRecentBackgroundJobPerformanceMetrics
} from "../utils/performance-metrics";
import { readString } from "../utils/validation";

export const performanceRoutes = new Hono<AppBindings>();

const VIEW_PERMISSIONS = [
  "performance.metrics.view",
  "performance.metrics.manage",
  "admin.system_health.view",
  "admin.system_health.manage",
  "settings.manage"
];
const MANAGE_PERMISSIONS = ["performance.metrics.manage", "admin.system_health.manage", "settings.manage"];

performanceRoutes.use("*", requireAuth);
performanceRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

function hasAny(user: AuthUser, permissions: string[]) {
  return Boolean(user.is_owner || permissions.some((permission) => user.permissions.includes(permission)));
}

function requirePerformanceView(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  if (hasAny(user, VIEW_PERMISSIONS)) return true;
  return false;
}

function whereFilters(c: Context<AppBindings>, allowed: { route?: boolean; metricType?: boolean; jobType?: boolean; status?: boolean; buildLabel?: boolean } = {}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  const dateFrom = readString(c.req.query("date_from"));
  const dateTo = readString(c.req.query("date_to"));
  if (dateFrom) {
    clauses.push("created_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push("created_at <= ?");
    params.push(dateTo);
  }
  if (allowed.route) {
    const route = readString(c.req.query("route_key"));
    if (route) {
      clauses.push("route_key LIKE ?");
      params.push(`%${route.split("?")[0].slice(0, 120)}%`);
    }
  }
  if (allowed.metricType) {
    const metricType = readString(c.req.query("metric_type")).toUpperCase();
    if (metricType) {
      clauses.push("metric_type = ?");
      params.push(metricType);
    }
  }
  if (allowed.jobType) {
    const jobType = readString(c.req.query("job_type"));
    if (jobType) {
      clauses.push("job_type LIKE ?");
      params.push(`%${jobType.slice(0, 120)}%`);
    }
  }
  if (allowed.status) {
    const status = readString(c.req.query("status")).toUpperCase();
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
  }
  if (allowed.buildLabel) {
    const buildLabel = readString(c.req.query("build_label"));
    if (buildLabel) {
      clauses.push("build_label LIKE ?");
      params.push(`%${buildLabel.slice(0, 120)}%`);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function severityClause(c: Context<AppBindings>, table: "api" | "frontend" | "job") {
  const severity = readString(c.req.query("severity")).toUpperCase();
  if (!severity) return { clause: "", params: [] as number[] };
  if (table === "api") {
    if (severity === "CRITICAL") return { clause: "duration_ms >= ?", params: [2000] };
    if (severity === "WARNING") return { clause: "duration_ms >= ? AND duration_ms < ?", params: [750, 2000] };
  }
  if (table === "frontend") {
    if (severity === "CRITICAL") return { clause: "duration_ms >= ?", params: [3000] };
    if (severity === "WARNING") return { clause: "duration_ms >= ? AND duration_ms < ?", params: [1500, 3000] };
  }
  if (table === "job") {
    if (severity === "CRITICAL") return { clause: "run_duration_ms >= ?", params: [300000] };
    if (severity === "WARNING") return { clause: "run_duration_ms >= ? AND run_duration_ms < ?", params: [60000, 300000] };
  }
  return { clause: "", params: [] as number[] };
}

function appendClause(baseWhere: string, clause: string) {
  if (!clause) return baseWhere;
  return baseWhere ? `${baseWhere} AND ${clause}` : `WHERE ${clause}`;
}

performanceRoutes.post("/frontend-metrics", async (c) => {
  const user = c.get("currentUser");
  let body: { metrics?: unknown[] } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const metrics = (Array.isArray(body.metrics) ? body.metrics : []) as FrontendPerformanceMetricInput[];
  const result = await recordFrontendPerformanceMetrics(c.env.DB, user, metrics);
  return ok(c, { accepted: result.accepted, inserted: result.inserted }, 202);
});

performanceRoutes.get("/overview", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  await syncRecentBackgroundJobPerformanceMetrics(c.env.DB, 50);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [api, frontend, jobs, builds, warnings] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total_count,
              AVG(duration_ms) AS avg_duration_ms,
              MAX(duration_ms) AS max_duration_ms,
              SUM(CASE WHEN duration_ms >= 750 THEN 1 ELSE 0 END) AS slow_count,
              SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS error_count
       FROM performance_api_metrics
       WHERE created_at >= ?`
    ).bind(since).first<Record<string, number | null>>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total_count,
              AVG(duration_ms) AS avg_duration_ms,
              MAX(duration_ms) AS max_duration_ms,
              SUM(CASE WHEN duration_ms >= 1500 THEN 1 ELSE 0 END) AS slow_count
       FROM performance_frontend_metrics
       WHERE created_at >= ?`
    ).bind(since).first<Record<string, number | null>>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total_count,
              AVG(run_duration_ms) AS avg_duration_ms,
              MAX(run_duration_ms) AS max_duration_ms,
              SUM(CASE WHEN run_duration_ms >= 60000 THEN 1 ELSE 0 END) AS slow_count,
              SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
       FROM performance_job_metrics
       WHERE created_at >= ?`
    ).bind(since).first<Record<string, number | null>>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total_count,
              MAX(largest_chunk_kb) AS largest_chunk_kb,
              SUM(CASE WHEN budget_status IN ('WARNING', 'FAIL') THEN 1 ELSE 0 END) AS budget_warning_count
       FROM performance_build_metrics`
    ).first<Record<string, number | null>>(),
    c.env.DB.prepare(
      `SELECT 'API' AS source, route_key AS item, duration_ms AS duration_ms, created_at
       FROM performance_api_metrics
       WHERE duration_ms >= 750 OR status_code >= 500
       UNION ALL
       SELECT 'FRONTEND' AS source, route_key AS item, duration_ms AS duration_ms, created_at
       FROM performance_frontend_metrics
       WHERE duration_ms >= 1500
       UNION ALL
       SELECT 'JOB' AS source, job_type AS item, run_duration_ms AS duration_ms, created_at
       FROM performance_job_metrics
       WHERE run_duration_ms >= 60000 OR status = 'FAILED'
       ORDER BY created_at DESC
       LIMIT 12`
    ).all<Record<string, unknown>>()
  ]);

  return ok(c, {
    window: "last_24_hours",
    api: api ?? {},
    frontend: frontend ?? {},
    jobs: jobs ?? {},
    builds: builds ?? {},
    recent_warnings: warnings.results
  });
});

performanceRoutes.get("/api-metrics", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  const pagination = parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 });
  const filters = whereFilters(c, { route: true });
  const severity = severityClause(c, "api");
  const where = appendClause(filters.where, severity.clause);
  const rows = await c.env.DB.prepare(
    `SELECT id, request_id, route_key, method, status_code, duration_ms, d1_query_count, d1_duration_ms, payload_bytes, cache_hint, created_at
     FROM performance_api_metrics
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...filters.params, ...severity.params, pagination.limit, pagination.offset).all<Record<string, unknown>>();
  return ok(c, { metrics: rows.results, pagination: paginationMeta(pagination, rows.results.length) });
});

performanceRoutes.get("/frontend-metrics", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  const pagination = parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 });
  const filters = whereFilters(c, { route: true, metricType: true });
  const severity = severityClause(c, "frontend");
  const where = appendClause(filters.where, severity.clause);
  const rows = await c.env.DB.prepare(
    `SELECT id, session_metric_id, route_key, metric_type, duration_ms, metadata_json, created_at
     FROM performance_frontend_metrics
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...filters.params, ...severity.params, pagination.limit, pagination.offset).all<Record<string, unknown>>();
  return ok(c, { metrics: rows.results, pagination: paginationMeta(pagination, rows.results.length) });
});

performanceRoutes.get("/job-metrics", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  await syncRecentBackgroundJobPerformanceMetrics(c.env.DB, 50);
  const pagination = parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 });
  const filters = whereFilters(c, { jobType: true, status: true });
  const severity = severityClause(c, "job");
  const where = appendClause(filters.where, severity.clause);
  const rows = await c.env.DB.prepare(
    `SELECT id, job_id, job_type, status, queue_wait_ms, run_duration_ms, attempt_count, processed_count, failed_count, created_at
     FROM performance_job_metrics
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...filters.params, ...severity.params, pagination.limit, pagination.offset).all<Record<string, unknown>>();
  return ok(c, { metrics: rows.results, pagination: paginationMeta(pagination, rows.results.length) });
});

performanceRoutes.get("/build-metrics", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  const pagination = parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 });
  const filters = whereFilters(c, { buildLabel: true, status: true });
  const rows = await c.env.DB.prepare(
    `SELECT id, build_label, main_entry_kb, initial_js_kb, initial_css_kb, largest_chunk_kb, chunk_count, budget_status, created_at
     FROM performance_build_metrics
     ${filters.where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...filters.params, pagination.limit, pagination.offset).all<Record<string, unknown>>();
  return ok(c, { metrics: rows.results, pagination: paginationMeta(pagination, rows.results.length) });
});

performanceRoutes.get("/warnings", async (c) => {
  if (!requirePerformanceView(c)) return fail(c, 403, "FORBIDDEN", "You do not have permission to view performance metrics.");
  const rows = await c.env.DB.prepare(
    `SELECT 'API' AS source, route_key AS route_key, method AS detail, duration_ms, created_at
     FROM performance_api_metrics
     WHERE duration_ms >= 750 OR status_code >= 500 OR payload_bytes >= 512000
     UNION ALL
     SELECT 'FRONTEND' AS source, route_key AS route_key, metric_type AS detail, duration_ms, created_at
     FROM performance_frontend_metrics
     WHERE duration_ms >= 1500
     UNION ALL
     SELECT 'JOB' AS source, job_type AS route_key, status AS detail, run_duration_ms AS duration_ms, created_at
     FROM performance_job_metrics
     WHERE run_duration_ms >= 60000 OR status = 'FAILED'
     UNION ALL
     SELECT 'BUILD' AS source, build_label AS route_key, budget_status AS detail, largest_chunk_kb AS duration_ms, created_at
     FROM performance_build_metrics
     WHERE budget_status IN ('WARNING', 'FAIL')
     ORDER BY created_at DESC
     LIMIT 50`
  ).all<Record<string, unknown>>();
  return ok(c, { warnings: rows.results });
});

performanceRoutes.post("/cleanup", async (c) => {
  const user = c.get("currentUser");
  if (!hasAny(user, MANAGE_PERMISSIONS)) return fail(c, 403, "FORBIDDEN", "You do not have permission to clean performance metrics.");
  let body: { detail_retention_days?: number; build_retention_days?: number } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const result = await cleanupPerformanceMetrics(c.env.DB, {
    detailRetentionDays: body.detail_retention_days,
    buildRetentionDays: body.build_retention_days
  });
  return ok(c, { cleanup: result });
});
