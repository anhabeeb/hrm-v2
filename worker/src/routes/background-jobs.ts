import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser } from "../types";
import {
  cancelJob,
  claimNextJob,
  eventToApi,
  getJob,
  jobToApi,
  listJobs,
  retryJob,
  runJobByType,
  runJobWithWaitUntil,
  type BackgroundJobEventRow,
  type BackgroundJobRow,
  type BackgroundJobStatus
} from "../utils/background-jobs";
import { fail, ok } from "../utils/http";
import { paginationMeta, parsePaginationParams } from "../utils/pagination";
import { readString } from "../utils/validation";

export const backgroundJobRoutes = new Hono<AppBindings>();

// Public contract after mounting in index.ts:
// GET /api/v1/background-jobs
// GET /api/v1/background-jobs/:jobId
// POST /api/v1/background-jobs/:jobId/retry
// POST /api/v1/background-jobs/:jobId/cancel
// POST /api/v1/background-jobs/:jobId/run
// POST /api/v1/background-jobs/run-next
const VIEW_ALL_PERMISSIONS = ["background_jobs.view", "background_jobs.manage", "background_jobs.run", "admin.system_health.view", "admin.system_health.manage"];
const MANAGE_PERMISSIONS = ["background_jobs.manage", "admin.system_health.manage", "settings.manage"];
const RUN_PERMISSIONS = ["background_jobs.run", "background_jobs.manage", "admin.system_health.manage", "admin.production_readiness.run"];
const JOB_STATUSES = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "RETRYING", "DEAD_LETTERED"]);

backgroundJobRoutes.use("*", requireAuth);
backgroundJobRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

function hasAny(user: AuthUser, permissions: string[]) {
  return Boolean(user.is_owner || permissions.some((permission) => user.permissions.includes(permission)));
}

function canViewJob(user: AuthUser, job: BackgroundJobRow) {
  return hasAny(user, VIEW_ALL_PERMISSIONS) || job.requested_by_user_id === user.id;
}

function canManageJob(user: AuthUser, job: BackgroundJobRow) {
  return hasAny(user, MANAGE_PERMISSIONS) || job.requested_by_user_id === user.id;
}

function getExecutionCtx(c: Context<AppBindings>) {
  return (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
}

async function getScopedJob(c: Context<AppBindings>, jobId: string) {
  const job = await getJob(c.env.DB, jobId);
  if (!job) return null;
  if (!canViewJob(c.get("currentUser"), job)) return null;
  return job;
}

backgroundJobRoutes.get("/", async (c) => {
  const user = c.get("currentUser");
  const pagination = parsePaginationParams(c, { defaultLimit: 20, maxLimit: 100 });
  const rawStatus = readString(c.req.query("status")).toUpperCase();
  const status = JOB_STATUSES.has(rawStatus) ? rawStatus as BackgroundJobStatus : null;
  const jobType = readString(c.req.query("job_type")) || null;
  const includeAll = hasAny(user, VIEW_ALL_PERMISSIONS) && readString(c.req.query("scope")) === "all";
  const rows = await listJobs(c.env.DB, {
    limit: pagination.limit,
    offset: pagination.offset,
    status,
    jobType,
    requestedByUserId: user.id,
    includeAll
  });
  return ok(c, {
    jobs: rows.map((row) => jobToApi(row)),
    pagination: paginationMeta(pagination, rows.length)
  });
});

backgroundJobRoutes.post("/run-next", async (c) => {
  const user = c.get("currentUser");
  if (!hasAny(user, RUN_PERMISSIONS)) return fail(c, 403, "FORBIDDEN", "You do not have permission to run background jobs.");
  const job = await claimNextJob(c.env.DB);
  if (!job) return ok(c, { job: null, message: "No queued background jobs are ready." });
  runJobWithWaitUntil(getExecutionCtx(c), runJobByType(c.env.DB, job), { jobId: job.id, jobType: job.job_type });
  return ok(c, { job: jobToApi(job), message: "Background job runner started." }, 202);
});

backgroundJobRoutes.get("/:jobId", async (c) => {
  const job = await getScopedJob(c, c.req.param("jobId"));
  if (!job) return fail(c, 404, "NOT_FOUND", "Background job was not found.");
  const events = await c.env.DB.prepare(
    `SELECT id, job_id, event_type, message, NULL AS metadata_json, created_at
     FROM background_job_events
     WHERE job_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(job.id).all<BackgroundJobEventRow>();
  return ok(c, {
    job: jobToApi(job, hasAny(c.get("currentUser"), VIEW_ALL_PERMISSIONS)),
    events: events.results.map((event) => eventToApi(event))
  });
});

backgroundJobRoutes.post("/:jobId/retry", async (c) => {
  const job = await getScopedJob(c, c.req.param("jobId"));
  if (!job) return fail(c, 404, "NOT_FOUND", "Background job was not found.");
  if (!canManageJob(c.get("currentUser"), job)) return fail(c, 403, "FORBIDDEN", "You do not have permission to retry this background job.");
  const updated = await retryJob(c.env.DB, job.id, c.get("currentUser").id);
  return ok(c, { job: updated ? jobToApi(updated) : null });
});

backgroundJobRoutes.post("/:jobId/cancel", async (c) => {
  const job = await getScopedJob(c, c.req.param("jobId"));
  if (!job) return fail(c, 404, "NOT_FOUND", "Background job was not found.");
  if (!canManageJob(c.get("currentUser"), job)) return fail(c, 403, "FORBIDDEN", "You do not have permission to cancel this background job.");
  if (job.status === "RUNNING") return fail(c, 409, "JOB_RUNNING", "Running jobs cannot be cancelled safely.");
  const updated = await cancelJob(c.env.DB, job.id, c.get("currentUser").id);
  return ok(c, { job: updated ? jobToApi(updated) : null });
});

backgroundJobRoutes.post("/:jobId/run", async (c) => {
  const user = c.get("currentUser");
  if (!hasAny(user, RUN_PERMISSIONS)) return fail(c, 403, "FORBIDDEN", "You do not have permission to run background jobs.");
  const job = await getJob(c.env.DB, c.req.param("jobId"));
  if (!job) return fail(c, 404, "NOT_FOUND", "Background job was not found.");
  if (!["QUEUED", "RETRYING"].includes(job.status)) return fail(c, 409, "JOB_NOT_RUNNABLE", "This job cannot be started in its current status.");
  runJobWithWaitUntil(getExecutionCtx(c), runJobByType(c.env.DB, job), { jobId: job.id, jobType: job.job_type });
  return ok(c, { job: jobToApi(job), message: "Background job runner started." }, 202);
});
