import type { Env } from "../types";
import { safeEmitAppEvent } from "./app-events";
import { nowIso } from "./http";

type SnapshotKind = "attendance" | "payroll" | "dashboard";
type SnapshotRow = Record<string, unknown> & { is_stale?: number | null; expires_at?: string | null };

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthPeriodKey(date: string) {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

function monthBounds(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString().slice(0, 10), next: next.toISOString().slice(0, 10) };
}

export async function markSnapshotStale(db: Env["DB"], kind: SnapshotKind, id: string) {
  const table = kind === "attendance" ? "attendance_summary_snapshots" : kind === "payroll" ? "payroll_summary_snapshots" : "dashboard_summary_snapshots";
  await db.prepare(`UPDATE ${table} SET is_stale = 1, updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
}

export async function markSnapshotsStaleForEmployee(db: Env["DB"], employeeId: string, options: { moduleKey?: "attendance" | "payroll" | "all"; periodKey?: string | null } = {}) {
  const now = nowIso();
  const moduleKey = options.moduleKey ?? "all";
  if (moduleKey === "attendance" || moduleKey === "all") {
    const params: unknown[] = [now, employeeId];
    const periodClause = options.periodKey ? " AND period_key = ?" : "";
    if (options.periodKey) params.push(options.periodKey);
    await db.prepare(`UPDATE attendance_summary_snapshots SET is_stale = 1, updated_at = ? WHERE employee_id = ?${periodClause}`).bind(...params).run();
  }
  if (moduleKey === "payroll" || moduleKey === "all") {
    await db.prepare("UPDATE payroll_summary_snapshots SET is_stale = 1, updated_at = ? WHERE employee_id = ?").bind(now, employeeId).run();
  }
  await db.prepare("UPDATE dashboard_summary_snapshots SET is_stale = 1, updated_at = ? WHERE module_key IN ('attendance','payroll','dashboard','employees')").bind(now).run();
}

export async function markSnapshotsStaleForPeriod(db: Env["DB"], input: { payrollPeriodId?: string | null; payrollRunId?: string | null; periodKey?: string | null; moduleKey?: "attendance" | "payroll" | "all" }) {
  const now = nowIso();
  const moduleKey = input.moduleKey ?? "all";
  if ((moduleKey === "attendance" || moduleKey === "all") && input.periodKey) {
    await db.prepare("UPDATE attendance_summary_snapshots SET is_stale = 1, updated_at = ? WHERE period_key = ?").bind(now, input.periodKey).run();
  }
  if (moduleKey === "payroll" || moduleKey === "all") {
    const conditions: string[] = [];
    const params: unknown[] = [now];
    if (input.payrollPeriodId) {
      conditions.push("payroll_period_id = ?");
      params.push(input.payrollPeriodId);
    }
    if (input.payrollRunId) {
      conditions.push("payroll_run_id = ?");
      params.push(input.payrollRunId);
    }
    if (conditions.length) {
      await db.prepare(`UPDATE payroll_summary_snapshots SET is_stale = 1, updated_at = ? WHERE ${conditions.join(" OR ")}`).bind(...params).run();
    }
  }
}

export async function getFreshSnapshot<T extends SnapshotRow>(
  db: Env["DB"],
  table: string,
  whereSql: string,
  params: unknown[] = [],
  options: { hasExpiresAt?: boolean } = {}
) {
  const expiryClause = options.hasExpiresAt ? " AND (expires_at IS NULL OR expires_at > ?)" : "";
  const bindings = options.hasExpiresAt ? [...params, nowIso()] : params;
  const row = await db.prepare(`SELECT * FROM ${table} WHERE ${whereSql} AND is_stale = 0${expiryClause} ORDER BY calculated_at DESC LIMIT 1`).bind(...bindings).first<T>();
  if (row) {
    console.log(JSON.stringify({ level: "debug", event: "snapshot.hit", table }));
  } else {
    console.log(JSON.stringify({ level: "debug", event: "snapshot.miss", table }));
  }
  return row ?? null;
}

export async function upsertSnapshot(db: Env["DB"], table: SnapshotKind, values: Record<string, unknown>) {
  const now = nowIso();
  if (table === "attendance") {
    const id = String(values.id ?? `attendance_snapshot_${crypto.randomUUID()}`);
    await db.prepare(
      `INSERT INTO attendance_summary_snapshots
        (id, employee_id, period_key, summary_date, status, present_days, absent_days, late_count, early_leave_count,
         missed_punch_count, overtime_minutes, leave_days, source_version, is_stale, calculated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(employee_id, period_key, summary_date) DO UPDATE SET
         status = excluded.status, present_days = excluded.present_days, absent_days = excluded.absent_days,
         late_count = excluded.late_count, early_leave_count = excluded.early_leave_count,
         missed_punch_count = excluded.missed_punch_count, overtime_minutes = excluded.overtime_minutes,
         leave_days = excluded.leave_days, source_version = excluded.source_version, is_stale = 0,
         calculated_at = excluded.calculated_at, updated_at = excluded.updated_at`
    ).bind(
      id,
      values.employee_id,
      values.period_key ?? null,
      values.summary_date ?? null,
      values.status ?? null,
      values.present_days ?? 0,
      values.absent_days ?? 0,
      values.late_count ?? 0,
      values.early_leave_count ?? 0,
      values.missed_punch_count ?? 0,
      values.overtime_minutes ?? 0,
      values.leave_days ?? 0,
      values.source_version ?? null,
      now,
      now,
      now
    ).run();
    return id;
  }

  if (table === "payroll") {
    const id = String(values.id ?? `payroll_snapshot_${crypto.randomUUID()}`);
    await db.prepare(
      `INSERT INTO payroll_summary_snapshots
        (id, employee_id, payroll_period_id, payroll_run_id, gross_salary, allowances_total, deductions_total,
         net_salary, payment_method, status, source_version, is_stale, calculated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(employee_id, payroll_period_id, payroll_run_id) DO UPDATE SET
         gross_salary = excluded.gross_salary, allowances_total = excluded.allowances_total,
         deductions_total = excluded.deductions_total, net_salary = excluded.net_salary,
         payment_method = excluded.payment_method, status = excluded.status, source_version = excluded.source_version,
         is_stale = 0, calculated_at = excluded.calculated_at, updated_at = excluded.updated_at`
    ).bind(
      id,
      values.employee_id,
      values.payroll_period_id ?? null,
      values.payroll_run_id ?? null,
      values.gross_salary ?? 0,
      values.allowances_total ?? 0,
      values.deductions_total ?? 0,
      values.net_salary ?? 0,
      values.payment_method ?? null,
      values.status ?? null,
      values.source_version ?? null,
      now,
      now,
      now
    ).run();
    return id;
  }

  const id = String(values.id ?? `dashboard_snapshot_${crypto.randomUUID()}`);
  await db.prepare(
    `INSERT INTO dashboard_summary_snapshots
      (id, snapshot_key, module_key, scope_hash, payload_json, source_version, is_stale, calculated_at, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
     ON CONFLICT(snapshot_key, module_key, scope_hash) DO UPDATE SET
       payload_json = excluded.payload_json, source_version = excluded.source_version, is_stale = 0,
       calculated_at = excluded.calculated_at, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
  ).bind(id, values.snapshot_key, values.module_key, values.scope_hash, values.payload_json ?? null, values.source_version ?? null, now, values.expires_at ?? null, now, now).run();
  return id;
}

export async function recalculateAttendanceSnapshot(db: Env["DB"], input: { employeeId: string; periodKey?: string | null; summaryDate?: string | null }) {
  const periodKey = input.periodKey ?? monthPeriodKey(input.summaryDate ?? nowIso().slice(0, 10));
  const bounds = input.summaryDate
    ? { start: input.summaryDate, next: input.summaryDate }
    : monthBounds(periodKey);
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN status IN ('PRESENT','LATE','HALF_DAY','EARLY_LEAVE') THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN status = 'ABSENT' OR is_absent = 1 THEN 1 ELSE 0 END) AS absent_days,
       SUM(CASE WHEN COALESCE(late_minutes, 0) > 0 OR is_late = 1 THEN 1 ELSE 0 END) AS late_count,
       SUM(CASE WHEN COALESCE(early_checkout_minutes, 0) > 0 OR is_early_leave = 1 THEN 1 ELSE 0 END) AS early_leave_count,
       SUM(CASE WHEN missed_punch = 1 OR status = 'MISSING_PUNCH' THEN 1 ELSE 0 END) AS missed_punch_count,
       SUM(COALESCE(payroll_impact_minutes, 0)) AS overtime_minutes,
       SUM(CASE WHEN is_leave_day = 1 OR status IN ('LEAVE','SICK_LEAVE','LONG_LEAVE','SICK') THEN 1 ELSE 0 END) AS leave_days,
       MAX(updated_at) AS source_version
     FROM attendance_daily_records
     WHERE employee_id = ? AND attendance_date >= ? AND attendance_date ${input.summaryDate ? "= ?" : "< ?"}`
  ).bind(input.employeeId, bounds.start, input.summaryDate ?? bounds.next).first<Record<string, unknown>>();

  const snapshot = {
    employee_id: input.employeeId,
    period_key: periodKey,
    summary_date: input.summaryDate ?? null,
    status: "READY",
    present_days: asNumber(row?.present_days),
    absent_days: asNumber(row?.absent_days),
    late_count: asNumber(row?.late_count),
    early_leave_count: asNumber(row?.early_leave_count),
    missed_punch_count: asNumber(row?.missed_punch_count),
    overtime_minutes: asNumber(row?.overtime_minutes),
    leave_days: asNumber(row?.leave_days),
    source_version: row?.source_version ?? null
  };
  const id = await upsertSnapshot(db, "attendance", snapshot);
  await safeEmitAppEvent(db, {
    eventType: "attendance.summary.updated",
    moduleKey: "attendance",
    entityType: "employee",
    entityId: input.employeeId,
    visibility: "COMPANY",
    payload: {
      employee_id: input.employeeId,
      period_key: periodKey,
      summary_date: input.summaryDate ?? null,
      status: "UPDATED",
      safe_label: "Attendance summary refreshed"
    },
    queryKeys: ["attendance", "dashboard.command-center"],
    dedupeKey: `attendance.summary.updated:${input.employeeId}:${periodKey}:${input.summaryDate ?? "period"}`
  });
  return { id, snapshot };
}

export async function recalculatePayrollSnapshot(db: Env["DB"], input: { employeeId: string; payrollPeriodId?: string | null; payrollRunId?: string | null }) {
  const row = await db.prepare(
    `SELECT
       pre.payroll_period_id,
       pre.payroll_run_id,
       pre.total_earnings AS gross_salary,
       COALESCE(pre.total_earnings, 0) - COALESCE(pre.basic_salary, 0) AS allowances_total,
       pre.total_deductions AS deductions_total,
       pre.net_salary,
       COALESCE(epp.payment_method, pm.payment_method_type) AS payment_method,
       pre.status,
       pre.updated_at AS source_version
     FROM payroll_employee_results pre
     LEFT JOIN employee_payroll_profiles epp ON epp.employee_id = pre.employee_id
     LEFT JOIN employee_payment_methods pm ON pm.employee_id = pre.employee_id AND pm.is_primary = 1 AND pm.status = 'ACTIVE'
     WHERE pre.employee_id = ?
       AND (? IS NULL OR pre.payroll_period_id = ?)
       AND (? IS NULL OR pre.payroll_run_id = ?)
     ORDER BY pre.updated_at DESC
     LIMIT 1`
  ).bind(input.employeeId, input.payrollPeriodId ?? null, input.payrollPeriodId ?? null, input.payrollRunId ?? null, input.payrollRunId ?? null).first<Record<string, unknown>>();

  const snapshot = {
    employee_id: input.employeeId,
    payroll_period_id: row?.payroll_period_id ?? input.payrollPeriodId ?? null,
    payroll_run_id: row?.payroll_run_id ?? input.payrollRunId ?? null,
    gross_salary: asNumber(row?.gross_salary),
    allowances_total: asNumber(row?.allowances_total),
    deductions_total: asNumber(row?.deductions_total),
    net_salary: asNumber(row?.net_salary),
    payment_method: row?.payment_method ?? null,
    status: row?.status ?? "NO_RESULT",
    source_version: row?.source_version ?? null
  };
  const id = await upsertSnapshot(db, "payroll", snapshot);
  await safeEmitAppEvent(db, {
    eventType: "payroll.summary.updated",
    moduleKey: "payroll",
    entityType: "employee",
    entityId: input.employeeId,
    visibility: "COMPANY",
    payload: {
      employee_id: input.employeeId,
      payroll_period_id: snapshot.payroll_period_id,
      payroll_run_id: snapshot.payroll_run_id,
      status: snapshot.status,
      safe_label: "Payroll summary refreshed"
    },
    queryKeys: ["payroll", "dashboard.command-center"],
    dedupeKey: `payroll.summary.updated:${input.employeeId}:${snapshot.payroll_period_id ?? "none"}:${snapshot.payroll_run_id ?? "none"}`
  });
  return { id, snapshot };
}

export function snapshotLog(event: string, metadata: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "debug", event, ...metadata }));
}
