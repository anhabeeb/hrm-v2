import type { Env } from "../types";
import { nowIso } from "./http";

type BindValue = string | number | null;

export interface DataRetentionPolicyRow {
  id: string;
  policy_key: string;
  description: string;
  retention_days: number | null;
  applies_to: string;
  is_enabled: number;
  is_system: number;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export interface RetentionCleanupOptions {
  dryRun?: boolean;
  limit?: number;
  now?: string;
}

export interface RetentionCleanupTargetResult {
  policy_key: string;
  target: string;
  action: "COUNT" | "DELETE" | "UPDATE" | "SKIP";
  dry_run: boolean;
  eligible_count: number | null;
  affected_count: number;
  retention_days: number | null;
  cutoff_at: string | null;
  status: "READY" | "SKIPPED" | "COMPLETED" | "ERROR";
  message: string;
}

interface CleanupTarget {
  policyKey: string;
  target: string;
  action: "DELETE" | "UPDATE";
  countSql: string;
  writeSql: string;
  countParams: (cutoffAt: string) => BindValue[];
  params: (cutoffAt: string, limit: number) => BindValue[];
}

const TERMINAL_JOB_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED", "DEAD_LETTERED"];
const DEFAULT_LIMIT = 250;
const BUSINESS_CRITICAL_TABLES = new Set([
  "employees",
  "employee_documents",
  "employee_document_versions",
  "payroll_periods",
  "payroll_runs",
  "payroll_employee_results",
  "payroll_result_line_items",
  "leave_requests",
  "attendance_records",
  "roster_assignments",
  "contracts",
  "audit_logs",
  "security_event_logs"
]);

const CLEANUP_TARGETS: CleanupTarget[] = [
  {
    policyKey: "performance_metrics_detailed",
    target: "performance_api_metrics",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM performance_api_metrics WHERE created_at < ?",
    writeSql: "DELETE FROM performance_api_metrics WHERE id IN (SELECT id FROM performance_api_metrics WHERE created_at < ? ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, limit]
  },
  {
    policyKey: "performance_metrics_detailed",
    target: "performance_frontend_metrics",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM performance_frontend_metrics WHERE created_at < ?",
    writeSql: "DELETE FROM performance_frontend_metrics WHERE id IN (SELECT id FROM performance_frontend_metrics WHERE created_at < ? ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, limit]
  },
  {
    policyKey: "performance_metrics_detailed",
    target: "performance_job_metrics",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM performance_job_metrics WHERE created_at < ?",
    writeSql: "DELETE FROM performance_job_metrics WHERE id IN (SELECT id FROM performance_job_metrics WHERE created_at < ? ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, limit]
  },
  {
    policyKey: "app_events",
    target: "app_events",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM app_events WHERE (expires_at IS NOT NULL AND expires_at < ?) OR created_at < ?",
    writeSql: "DELETE FROM app_events WHERE id IN (SELECT id FROM app_events WHERE (expires_at IS NOT NULL AND expires_at < ?) OR created_at < ? ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt, cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, cutoffAt, limit]
  },
  {
    policyKey: "background_job_events",
    target: "background_job_events",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM background_job_events WHERE created_at < ?",
    writeSql: "DELETE FROM background_job_events WHERE id IN (SELECT id FROM background_job_events WHERE created_at < ? ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, limit]
  },
  {
    policyKey: "background_jobs_terminal_states",
    target: "background_jobs",
    action: "DELETE",
    countSql: `SELECT COUNT(*) AS count FROM background_jobs WHERE status IN (${TERMINAL_JOB_STATUSES.map(() => "?").join(", ")}) AND COALESCE(completed_at, updated_at, created_at) < ?`,
    writeSql: `DELETE FROM background_jobs WHERE id IN (SELECT id FROM background_jobs WHERE status IN (${TERMINAL_JOB_STATUSES.map(() => "?").join(", ")}) AND COALESCE(completed_at, updated_at, created_at) < ? ORDER BY COALESCE(completed_at, updated_at, created_at) ASC LIMIT ?)`,
    countParams: (cutoffAt) => [...TERMINAL_JOB_STATUSES, cutoffAt],
    params: (cutoffAt, limit) => [...TERMINAL_JOB_STATUSES, cutoffAt, limit]
  },
  {
    policyKey: "report_export_artifacts",
    target: "report_export_artifacts",
    action: "UPDATE",
    countSql: "SELECT COUNT(*) AS count FROM report_export_artifacts WHERE status != 'EXPIRED' AND ((expires_at IS NOT NULL AND expires_at < ?) OR created_at < ?)",
    writeSql: "UPDATE report_export_artifacts SET status = 'EXPIRED', storage_key = NULL, updated_at = ? WHERE id IN (SELECT id FROM report_export_artifacts WHERE status != 'EXPIRED' AND ((expires_at IS NOT NULL AND expires_at < ?) OR created_at < ?) ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt, cutoffAt],
    params: (cutoffAt, limit) => [nowIso(), cutoffAt, cutoffAt, limit]
  },
  {
    policyKey: "document_upload_sessions_pending_failed",
    target: "document_upload_sessions",
    action: "UPDATE",
    countSql: "SELECT COUNT(*) AS count FROM document_upload_sessions WHERE status IN ('PREPARED', 'UPLOADING', 'UPLOADED', 'COMPLETING', 'FAILED', 'EXPIRED') AND expires_at < ?",
    writeSql: "UPDATE document_upload_sessions SET status = 'CLEANED_UP', cleaned_up_at = ?, updated_at = ? WHERE id IN (SELECT id FROM document_upload_sessions WHERE status IN ('PREPARED', 'UPLOADING', 'UPLOADED', 'COMPLETING', 'FAILED', 'EXPIRED') AND expires_at < ? ORDER BY expires_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt],
    params: (cutoffAt, limit) => [nowIso(), nowIso(), cutoffAt, limit]
  },
  {
    policyKey: "dashboard_summary_snapshots",
    target: "dashboard_summary_snapshots",
    action: "DELETE",
    countSql: "SELECT COUNT(*) AS count FROM dashboard_summary_snapshots WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (is_stale = 1 AND created_at < ?)",
    writeSql: "DELETE FROM dashboard_summary_snapshots WHERE id IN (SELECT id FROM dashboard_summary_snapshots WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (is_stale = 1 AND created_at < ?) ORDER BY created_at ASC LIMIT ?)",
    countParams: (cutoffAt) => [cutoffAt, cutoffAt],
    params: (cutoffAt, limit) => [cutoffAt, cutoffAt, limit]
  }
];

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cutoffIso(days: number, now = nowIso()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - Math.max(0, Math.trunc(days)));
  return date.toISOString();
}

function normalizeLimit(value: number | undefined) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(1000, Math.trunc(parsed))) : DEFAULT_LIMIT;
}

function affectedChanges(result: { meta?: { changes?: number } }) {
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
}

async function countEligible(db: Env["DB"], sql: string, params: BindValue[]) {
  const row = await db.prepare(sql).bind(...params).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function tableExists(db: Env["DB"], tableName: string) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(tableName).first<{ name: string }>();
  return Boolean(row?.name);
}

export async function listDataRetentionPolicies(db: Env["DB"]) {
  const rows = await db.prepare("SELECT * FROM data_retention_policies ORDER BY is_system DESC, policy_key ASC").all<DataRetentionPolicyRow>();
  return rows.results.map((row) => ({
    ...row,
    is_enabled: row.is_enabled === 1,
    is_system: row.is_system === 1,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {})
  }));
}

export async function getDataRetentionPolicyRows(db: Env["DB"]) {
  const rows = await db.prepare("SELECT * FROM data_retention_policies ORDER BY policy_key ASC").all<DataRetentionPolicyRow>();
  return rows.results;
}

export async function updateDataRetentionPolicy(db: Env["DB"], policyId: string, input: { retentionDays?: number | null; isEnabled?: boolean; description?: string | null }) {
  const existing = await db.prepare("SELECT * FROM data_retention_policies WHERE id = ?").bind(policyId).first<DataRetentionPolicyRow>();
  if (!existing) return null;
  const retentionDays = input.retentionDays === undefined ? existing.retention_days : input.retentionDays;
  const isEnabled = input.isEnabled === undefined ? existing.is_enabled : input.isEnabled ? 1 : 0;
  const description = input.description?.trim() || existing.description;
  await db.prepare(
    `UPDATE data_retention_policies
     SET retention_days = ?, is_enabled = ?, description = ?, updated_at = ?
     WHERE id = ?`
  ).bind(retentionDays, isEnabled, description, nowIso(), policyId).run();
  return db.prepare("SELECT * FROM data_retention_policies WHERE id = ?").bind(policyId).first<DataRetentionPolicyRow>();
}

export async function runDataRetentionCleanup(db: Env["DB"], options: RetentionCleanupOptions = {}) {
  const dryRun = options.dryRun !== false;
  const limit = normalizeLimit(options.limit);
  const policies = await getDataRetentionPolicyRows(db);
  const byKey = new Map(policies.map((policy) => [policy.policy_key, policy]));
  const results: RetentionCleanupTargetResult[] = [];

  for (const target of CLEANUP_TARGETS) {
    const policy = byKey.get(target.policyKey);
    const statusBase = {
      policy_key: target.policyKey,
      target: target.target,
      action: dryRun ? "COUNT" as const : target.action,
      dry_run: dryRun,
      eligible_count: null,
      affected_count: 0,
      retention_days: policy?.retention_days ?? null,
      cutoff_at: null
    };

    if (BUSINESS_CRITICAL_TABLES.has(target.target)) {
      results.push({ ...statusBase, status: "SKIPPED", message: "Business-critical target is blocked from automated cleanup." });
      continue;
    }

    if (!policy || policy.is_enabled !== 1 || policy.retention_days === null || policy.retention_days === undefined) {
      results.push({ ...statusBase, status: "SKIPPED", message: "Retention policy is disabled or has no retention window." });
      continue;
    }

    if (!(await tableExists(db, target.target))) {
      results.push({ ...statusBase, status: "SKIPPED", message: "Target table is not present in this environment." });
      continue;
    }

    const cutoffAt = cutoffIso(policy.retention_days, options.now);
    const params = target.params(cutoffAt, limit);
    const countParams = target.countParams(cutoffAt);
    try {
      const eligible = await countEligible(db, target.countSql, countParams);
      if (dryRun) {
        results.push({ ...statusBase, eligible_count: eligible, cutoff_at: cutoffAt, status: "READY", message: "Dry-run only. No data was changed." });
        continue;
      }

      const write = await db.prepare(target.writeSql).bind(...params).run();
      results.push({
        ...statusBase,
        action: target.action,
        eligible_count: eligible,
        affected_count: affectedChanges(write),
        cutoff_at: cutoffAt,
        status: "COMPLETED",
        message: "Safe operational cleanup completed for this bounded target."
      });
    } catch (error) {
      results.push({
        ...statusBase,
        cutoff_at: cutoffAt,
        status: "ERROR",
        message: error instanceof Error ? error.message : "Cleanup target failed safely."
      });
    }
  }

  return {
    dry_run: dryRun,
    limit,
    generated_at: nowIso(),
    protected_targets: Array.from(BUSINESS_CRITICAL_TABLES),
    results,
    totals: {
      targets: results.length,
      eligible_count: results.reduce((sum, item) => sum + Number(item.eligible_count ?? 0), 0),
      affected_count: results.reduce((sum, item) => sum + item.affected_count, 0),
      errors: results.filter((item) => item.status === "ERROR").length,
      skipped: results.filter((item) => item.status === "SKIPPED").length
    }
  };
}

export async function getBackupRetentionStatus(db: Env["DB"]) {
  const policies = await listDataRetentionPolicies(db);
  const dryRun = await runDataRetentionCleanup(db, { dryRun: true, limit: 100 });
  const tableCounts: Record<string, number | null> = {};
  for (const table of ["background_jobs", "background_job_events", "app_events", "report_export_artifacts", "document_upload_sessions", "dashboard_summary_snapshots"]) {
    try {
      tableCounts[table] = await countEligible(db, `SELECT COUNT(*) AS count FROM ${table}`, []);
    } catch {
      tableCounts[table] = null;
    }
  }
  return {
    generated_at: nowIso(),
    backup_readiness: {
      d1_binding: "DB",
      r2_binding: "DOCUMENTS_BUCKET",
      live_backup_from_browser: false,
      restore_from_browser: false,
      dry_run_default: true,
      manifest_script: "npm run backup:create-manifest-phase16",
      d1_backup_script: "npm run backup:d1-phase16",
      d1_restore_dry_run_script: "npm run restore:d1-dry-run-phase16",
      r2_inventory_script: "npm run backup:r2-inventory-phase16",
      r2_restore_readiness_script: "npm run verify:r2-restore-readiness-phase16"
    },
    policies,
    dry_run: dryRun,
    table_counts: tableCounts,
    runbook_links: [
      "docs/production/phase16-backup-restore-disaster-recovery.md",
      "docs/production/backup-manifest-format.md",
      "docs/user-guides/production-operations-runbook.md"
    ]
  };
}
