import { Hono } from "hono";
import type { Context } from "hono";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type Row = Record<string, unknown>;

export const selfServiceRoutes = new Hono<AppBindings>();
export const kycRoutes = new Hono<AppBindings>();

selfServiceRoutes.use("*", requireAuth);
kycRoutes.use("*", requireAuth);

kycRoutes.use("*", async (c, next) => {
  if (!hasAny(c, ["employees.update", "employees.sensitive.update"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to review KYC requests.");
  }
  await next();
});

async function linkedEmployeeId(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  if (user.employee_id) return user.employee_id;
  const row = await c.env.DB.prepare("SELECT id FROM employees WHERE user_id = ? LIMIT 1").bind(user.id).first<{ id: string }>();
  return row?.id ?? null;
}

async function requireLinkedEmployee(c: Context<AppBindings>) {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) {
    return { employeeId: null, response: fail(c, 403, "SELF_SERVICE_UNAVAILABLE", "This account is not linked to an employee profile.") };
  }
  return { employeeId, response: null };
}

function maskSelfServiceDocuments(rows: Row[]) {
  return rows.map((row) => {
    const sensitive = Number(row.is_sensitive ?? 0) === 1;
    if (!sensitive) return { ...row, restricted: false };
    return {
      ...row,
      document_number: null,
      original_filename: null,
      document_type_name: "Restricted document",
      category_name: "Restricted",
      is_sensitive: true,
      restricted: true
    };
  });
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const userPermissions = c.get("currentUser").permissions;
  return permissions.some((permission) => userPermissions.includes(permission));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function selfServiceEmployee(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB
    .prepare(
      `SELECT e.*, d.name AS department_name, p.title AS position_title, l.name AS location_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Row>();
}

async function findSelfServiceLeavePolicy(c: Context<AppBindings>, employee: Row, leaveTypeId: string) {
  return c.env.DB
    .prepare(
      `SELECT * FROM leave_policies
       WHERE leave_type_id = ? AND is_active = 1
         AND (applies_to_employee_type IS NULL OR applies_to_employee_type = ?)
         AND (applies_to_employment_type IS NULL OR applies_to_employment_type = ?)
         AND (department_id IS NULL OR department_id = ?)
         AND (position_id IS NULL OR position_id = ?)
         AND (location_id IS NULL OR location_id = ?)
       ORDER BY priority ASC, created_at ASC LIMIT 1`
    )
    .bind(leaveTypeId, employee.employee_type, employee.employment_type, employee.primary_department_id, employee.primary_position_id, employee.primary_location_id)
    .first<Row>();
}

function calculateSelfServiceLeaveDays(startDate: string, endDate: string, halfDayType: string, includeWeeklyOff: boolean) {
  const total = daysBetween(startDate, endDate);
  if (!total) return null;
  let counted = 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    if (!weekend || includeWeeklyOff) counted += 1;
  }
  if (total === 1 && halfDayType !== "NONE") counted = 0.5;
  return { total, counted };
}

async function generateSelfServiceLeaveDays(c: Context<AppBindings>, requestId: string, startDate: string, endDate: string, halfDayType: string, includeWeeklyOff: boolean) {
  const total = daysBetween(startDate, endDate) ?? 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const statements = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    const singleHalf = total === 1 && halfDayType !== "NONE";
    const dayType = singleHalf ? "HALF_DAY" : weekend ? "WEEKLY_OFF" : "FULL_DAY";
    statements.push(
      c.env.DB
        .prepare("INSERT INTO leave_request_days (id, leave_request_id, leave_date, day_type, counted_as_leave, payroll_impact_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), requestId, isoDate(date), dayType, dayType === "WEEKLY_OFF" && !includeWeeklyOff ? 0 : 1, JSON.stringify({ source: "self_service_foundation" }))
    );
  }
  if (statements.length) await c.env.DB.batch(statements);
}

function selfServiceDocumentRequired(policy: Row | null, requestedDays: number) {
  if (!policy) return false;
  if (Number(policy.requires_document) === 1) return true;
  const consecutive = Number(policy.document_required_after_consecutive_days ?? 0);
  return consecutive > 0 && requestedDays > consecutive;
}

async function selfServiceFirstUserWithPermission(c: Context<AppBindings>, permission: string) {
  return c.env.DB
    .prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.status = 'ACTIVE' AND p.key = ?
       LIMIT 1`
    )
    .bind(permission)
    .first<{ id: string }>();
}

async function generateSelfServiceApprovalTimeline(c: Context<AppBindings>, request: Row) {
  const workflow = await c.env.DB
    .prepare(
      `SELECT * FROM leave_approval_workflows
       WHERE is_active = 1
         AND (applies_to_leave_type_id IS NULL OR applies_to_leave_type_id = ?)
         AND (applies_to_employee_type IS NULL OR applies_to_employee_type = ?)
         AND (applies_to_employment_type IS NULL OR applies_to_employment_type = ?)
         AND (department_id IS NULL OR department_id = ?)
         AND (location_id IS NULL OR location_id = ?)
       ORDER BY CASE WHEN is_default = 1 THEN 1 ELSE 0 END ASC, priority ASC, created_at ASC
       LIMIT 1`
    )
    .bind(request.leave_type_id, request.employee_type, request.employment_type, request.primary_department_id, request.primary_location_id)
    .first<Row>();
  const steps = workflow
    ? (await c.env.DB.prepare("SELECT * FROM leave_approval_steps WHERE workflow_id = ? ORDER BY step_order").bind(String(workflow.id)).all<Row>()).results
    : [{ step_order: 1, step_name: "HR approval", approver_type: "PERMISSION", permission_key: "leave.approve", is_required: 1, skip_if_no_approver: 0 }];
  for (const step of steps) {
    const approver = String(step.approver_type) === "PERMISSION" ? (await selfServiceFirstUserWithPermission(c, String(step.permission_key ?? "leave.approve")))?.id ?? null : null;
    const skipped = !approver && Number(step.skip_if_no_approver ?? 0) === 1;
    await c.env.DB
      .prepare("INSERT INTO leave_request_approvals (id, leave_request_id, workflow_id, step_id, step_order, step_name, approver_user_id, approver_type, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), request.id, workflow?.id ?? null, step.id ?? null, Number(step.step_order), String(step.step_name), approver, String(step.approver_type), skipped ? "SKIPPED" : "PENDING", skipped ? "Skipped because no approver was resolved." : approver ? null : "No approver resolved; HR/admin action required.")
      .run();
  }
}

async function updateSelfServiceLeaveBalance(c: Context<AppBindings>, request: Row, mode: "pending_add" | "approve") {
  const employeeId = String(request.employee_id);
  const leaveTypeId = String(request.leave_type_id);
  const year = Number(String(request.start_date).slice(0, 4));
  const requested = Number(request.requested_days ?? 0);
  const existing = await c.env.DB.prepare("SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?").bind(employeeId, leaveTypeId, year).first<{ id: string }>();
  if (!existing) {
    await c.env.DB.prepare("INSERT INTO leave_balances (id, employee_id, leave_type_id, period_year, accrued_days, closing_balance) VALUES (?, ?, ?, ?, 0, 0)").bind(crypto.randomUUID(), employeeId, leaveTypeId, year).run();
  }
  const clause = mode === "pending_add" ? "pending_days = pending_days + ?" : "used_days = used_days + ?";
  await c.env.DB.prepare(`UPDATE leave_balances SET ${clause}, closing_balance = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days, updated_at = ? WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?`).bind(requested, new Date().toISOString(), employeeId, leaveTypeId, year).run();
}

selfServiceRoutes.get("/me", async (c) => {
  const employeeId = await linkedEmployeeId(c);
  return ok(c, {
    linked_employee: Boolean(employeeId),
    employee_id: employeeId,
    unavailable_message: employeeId ? null : "This account is not linked to an employee profile."
  });
});

selfServiceRoutes.get("/profile", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const employee = await c.env.DB
    .prepare(
      `SELECT e.id, e.employee_no, e.profile_photo_document_id, e.full_name, e.display_name,
        e.employee_type, e.employment_type, e.joining_date, e.confirmation_date,
        e.contract_start_date, e.contract_end_date, s.name AS status_name,
        d.name AS department_name, p.title AS position_title, l.name AS location_name,
        jl.name AS job_level_name
       FROM employees e
       LEFT JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       WHERE e.id = ?`
    )
    .bind(gate.employeeId)
    .first<Row>();
  const contacts = (
    await c.env.DB
      .prepare(
        `SELECT contact_type, value, country_code, relationship, is_primary, emergency_priority
         FROM employee_contacts
         WHERE employee_id = ? AND archived_at IS NULL
         ORDER BY is_primary DESC, emergency_priority ASC, contact_type ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { employee, contacts });
});

selfServiceRoutes.get("/documents", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT ed.id, dt.name AS document_type_name, dc.name AS category_name,
          ed.document_number, ed.issue_date, ed.expiry_date,
          CASE
            WHEN ed.status <> 'ACTIVE' THEN ed.status
            WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) < date('now') THEN 'EXPIRED'
            WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) <= date('now', '+30 day') THEN 'EXPIRING_SOON'
            ELSE 'VALID'
          END AS display_status,
          ed.status, COALESCE(ed.is_sensitive, dt.is_sensitive, 0) AS is_sensitive,
          v.original_filename
         FROM employee_documents ed
         JOIN document_types dt ON dt.id = ed.document_type_id
         LEFT JOIN document_categories dc ON dc.id = ed.category_id
         LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
         WHERE ed.employee_id = ? AND ed.status <> 'SOFT_DELETED'
         ORDER BY COALESCE(ed.expiry_date, ed.created_at) ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { documents: maskSelfServiceDocuments(rows), upload_enabled: false, upload_note: "Document uploads are managed by HR/Admin." });
});

selfServiceRoutes.get("/attendance", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const from = c.req.query("date_from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = c.req.query("date_to") ?? new Date().toISOString().slice(0, 10);
  const records = (
    await c.env.DB
      .prepare(
        `SELECT id, attendance_date, status, first_clock_in, last_clock_out,
          total_work_minutes, late_minutes, early_checkout_minutes, missed_punch, source, payroll_impact_json, notes
         FROM attendance_daily_records
         WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ?
         ORDER BY attendance_date DESC`
      )
      .bind(gate.employeeId, from, to)
      .all<Row>()
  ).results;
  const corrections = (
    await c.env.DB
      .prepare(
        `SELECT id, attendance_date, requested_clock_in, requested_clock_out, requested_status,
          reason, status, reviewed_at, review_note, created_at
         FROM attendance_correction_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC LIMIT 100`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { records, corrections, filters: { date_from: from, date_to: to } });
});

selfServiceRoutes.post("/attendance/corrections", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const attendanceDate = readString(body.attendance_date);
  const reason = readString(body.reason);
  if (!attendanceDate || !reason) {
    return fail(c, 400, "VALIDATION_ERROR", "Attendance date and reason are required.");
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO attendance_correction_requests
       (id, employee_id, attendance_date, requested_clock_in, requested_clock_out, requested_status, reason, requested_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, gate.employeeId, attendanceDate, readString(body.requested_clock_in) || null, readString(body.requested_clock_out) || null, readString(body.requested_status) || null, reason, c.get("currentUser").id)
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.attendance_correction_requested",
    module: "self_service",
    entityType: "self_service",
    entityId: id,
    newValue: { attendance_date: attendanceDate },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "self_service.changed", { actor_user_id: c.get("currentUser").id, entity_type: "self_service", entity_id: id, action: "attendance_correction_requested" });
  return ok(c, { correction_id: id }, 201);
});

selfServiceRoutes.get("/leave", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const balances = (await c.env.DB.prepare("SELECT * FROM leave_balances WHERE employee_id = ? ORDER BY period_year DESC").bind(gate.employeeId).all<Row>()).results;
  const requests = (
    await c.env.DB
      .prepare(
        `SELECT lr.*, lt.name AS leave_type_name
         FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.employee_id = ? ORDER BY lr.created_at DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  const approvals = (
    await c.env.DB
      .prepare(
        `SELECT a.* FROM leave_request_approvals a
         JOIN leave_requests lr ON lr.id = a.leave_request_id
         WHERE lr.employee_id = ? ORDER BY a.step_order ASC, a.created_at ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { balances, requests, approvals, leave_request_enabled: c.get("currentUser").permissions.includes("self_service.leave_request") || c.get("currentUser").permissions.includes("leave.request") });
});

selfServiceRoutes.post("/leave/requests", async (c) => {
  if (!hasAny(c, ["self_service.leave_request", "leave.request"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to create a self-service leave request.");
  }
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const leaveTypeId = readString(body.leave_type_id);
  const startDate = readString(body.start_date);
  const endDate = readString(body.end_date);
  const halfDayType = readString(body.half_day_type) || "NONE";
  if (!leaveTypeId || !startDate || !endDate) {
    return fail(c, 400, "VALIDATION_ERROR", "Leave type, start date, and end date are required.");
  }
  const employee = await selfServiceEmployee(c, gate.employeeId);
  if (!employee) return fail(c, 400, "INVALID_EMPLOYEE", "Linked employee profile was not found or is archived.");
  const leaveType = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ? AND is_active = 1").bind(leaveTypeId).first<Row>();
  if (!leaveType) return fail(c, 400, "INVALID_LEAVE_TYPE", "Leave type was not found or is disabled.");
  const overlap = await c.env.DB
    .prepare("SELECT id FROM leave_requests WHERE employee_id = ? AND status NOT IN ('REJECTED', 'CANCELLED') AND (? <= end_date AND ? >= start_date) LIMIT 1")
    .bind(gate.employeeId, startDate, endDate)
    .first<{ id: string }>();
  if (overlap) return fail(c, 409, "OVERLAPPING_LEAVE", "An active leave request already overlaps this date range.");
  const policy = await findSelfServiceLeavePolicy(c, employee, leaveTypeId);
  if (halfDayType !== "NONE" && policy && Number(policy.allow_half_day) !== 1) {
    return fail(c, 400, "HALF_DAY_NOT_ALLOWED", "Selected policy does not allow half-day leave.");
  }
  const calculated = calculateSelfServiceLeaveDays(startDate, endDate, halfDayType, Number(policy?.include_weekly_off_days ?? 0) === 1);
  if (!calculated || calculated.counted <= 0) return fail(c, 400, "INVALID_DATES", "Leave dates must produce at least one counted leave day.");
  if (policy?.max_consecutive_days && calculated.counted > Number(policy.max_consecutive_days)) {
    return fail(c, 400, "MAX_CONSECUTIVE_DAYS", "Requested leave exceeds the policy maximum consecutive days.");
  }
  const documentRequired = selfServiceDocumentRequired(policy, calculated.counted);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const salaryMode = String(policy?.salary_deduction_mode ?? "NONE");
  await c.env.DB
    .prepare(
      `INSERT INTO leave_requests
       (id, employee_id, leave_type_id, policy_id, start_date, end_date, total_days, requested_days, half_day_type,
        reason, status, document_required, document_status, salary_deduction_mode, salary_deduction_estimate_json,
        public_holiday_handling_json, submitted_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      gate.employeeId,
      leaveTypeId,
      policy?.id ?? null,
      startDate,
      endDate,
      calculated.total,
      calculated.counted,
      halfDayType,
      readString(body.reason) || null,
      documentRequired ? 1 : 0,
      documentRequired ? "REQUIRED_PENDING" : "NOT_REQUIRED",
      salaryMode,
      JSON.stringify({ mode: salaryMode, estimated_days: salaryMode === "NONE" ? 0 : calculated.counted, source: "self_service_foundation" }),
      JSON.stringify({ include_weekly_off_days: Number(policy?.include_weekly_off_days ?? 0) === 1 }),
      c.get("currentUser").id
    )
    .run();
  await generateSelfServiceLeaveDays(c, id, startDate, endDate, halfDayType, Number(policy?.include_weekly_off_days ?? 0) === 1);
  let finalStatus = "DRAFT";
  if (!documentRequired) {
    const requestForTimeline = { ...employee, id, employee_id: gate.employeeId, leave_type_id: leaveTypeId, start_date: startDate, requested_days: calculated.counted };
    await generateSelfServiceApprovalTimeline(c, requestForTimeline);
    const pending = await c.env.DB.prepare("SELECT id FROM leave_request_approvals WHERE leave_request_id = ? AND status = 'PENDING' ORDER BY step_order LIMIT 1").bind(id).first();
    if (pending) {
      finalStatus = "PENDING_APPROVAL";
      await c.env.DB.prepare("UPDATE leave_requests SET status = 'PENDING_APPROVAL', submitted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
      await updateSelfServiceLeaveBalance(c, { employee_id: gate.employeeId, leave_type_id: leaveTypeId, start_date: startDate, requested_days: calculated.counted }, "pending_add");
    } else {
      finalStatus = "APPROVED";
      await c.env.DB.prepare("UPDATE leave_requests SET status = 'APPROVED', submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, id).run();
      await updateSelfServiceLeaveBalance(c, { employee_id: gate.employeeId, leave_type_id: leaveTypeId, start_date: startDate, requested_days: calculated.counted }, "approve");
    }
  }
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: documentRequired ? "self_service.leave_request.created" : "self_service.leave_request.submitted",
    module: "self_service",
    entityType: "leave_request",
    entityId: id,
    newValue: { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, status: finalStatus, document_required: documentRequired },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "self_service.changed", { actor_user_id: c.get("currentUser").id, entity_type: "leave_request", entity_id: id, action: "self_service.leave_request.submitted" });
  const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ?").bind(id).first<Row>();
  const approvals = (await c.env.DB.prepare("SELECT * FROM leave_request_approvals WHERE leave_request_id = ? ORDER BY step_order").bind(id).all<Row>()).results;
  return ok(c, { request, approvals, document_required: documentRequired }, 201);
});

selfServiceRoutes.get("/payroll", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const profile = await c.env.DB.prepare("SELECT employee_id, basic_salary, currency, payroll_included, payment_method, effective_from FROM employee_payroll_profiles WHERE employee_id = ?").bind(gate.employeeId).first<Row>();
  const runs = (
    await c.env.DB
      .prepare(
        `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
          pre.status, pre.basic_salary, pre.total_earnings, pre.total_deductions, pre.net_salary, pr.paid_at
         FROM payroll_run_employees pre
         JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
         JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
         WHERE pre.employee_id = ?
         ORDER BY pp.period_year DESC, pp.period_month DESC LIMIT 24`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  const advances = (await c.env.DB.prepare("SELECT amount, payment_date, status, notes, created_at FROM payroll_advance_payments WHERE employee_id = ? ORDER BY payment_date DESC LIMIT 24").bind(gate.employeeId).all<Row>()).results;
  const deductions = (await c.env.DB.prepare("SELECT deduction_type, amount, start_date, end_date, status, reason FROM payroll_deductions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 24").bind(gate.employeeId).all<Row>()).results;
  return ok(c, { profile, runs, advances, deductions, payslip_download_enabled: false });
});

selfServiceRoutes.get("/assets", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const assignments = (
    await c.env.DB
      .prepare(
        `SELECT aa.id, ac.name AS category_name, ai.code AS asset_code, ai.name AS asset_name,
          ai.variant, ai.size, aa.issued_date, aa.expected_return_date, aa.returned_date,
          aa.status, aa.condition_on_issue, aa.condition_on_return, aa.deduction_amount
         FROM employee_asset_assignments aa
         JOIN asset_items ai ON ai.id = aa.asset_item_id
         JOIN asset_categories ac ON ac.id = ai.category_id
         WHERE aa.employee_id = ?
         ORDER BY aa.issued_date DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { assignments });
});

selfServiceRoutes.get("/kyc-requests", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT id, section, field_key, requested_value_json, reason, status,
          reviewed_at, review_note, created_at, updated_at
         FROM employee_kyc_update_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { requests: rows });
});

selfServiceRoutes.post("/kyc-requests", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const section = readString(body.section);
  const fieldKey = readString(body.field_key);
  const reason = readString(body.reason);
  const requestedValue = body.requested_value ?? body.requested_value_json ?? body.fields;
  if (!section || requestedValue === undefined || requestedValue === null) {
    return fail(c, 400, "VALIDATION_ERROR", "Section and requested value are required.");
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_kyc_update_requests
       (id, employee_id, requested_by_user_id, section, field_key, requested_value_json, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, gate.employeeId, c.get("currentUser").id, section, fieldKey || null, JSON.stringify(requestedValue), reason || null)
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.submitted",
    module: "self_service",
    entityType: "kyc_request",
    entityId: id,
    newValue: { section, field_key: fieldKey || null },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.submitted", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: id, action: "kyc_request.submitted" });
  return ok(c, { request_id: id }, 201);
});

kycRoutes.get("/", async (c) => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const search = readString(c.req.query("search"));
  const status = readString(c.req.query("status"));
  const section = readString(c.req.query("section"));
  const dateFrom = readString(c.req.query("date_from"));
  const dateTo = readString(c.req.query("date_to"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR kr.field_key LIKE ? OR kr.reason LIKE ?)");
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push("kr.status = ?");
    bindings.push(status);
  }
  if (section) {
    conditions.push("kr.section = ?");
    bindings.push(section);
  }
  if (dateFrom) {
    conditions.push("date(kr.created_at) >= date(?)");
    bindings.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("date(kr.created_at) <= date(?)");
    bindings.push(dateTo);
  }
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT kr.id, kr.employee_id, e.employee_no, e.full_name AS employee_name,
          kr.section, kr.field_key, kr.requested_value_json, kr.reason, kr.status,
          u.name AS requested_by_name, kr.created_at, kr.reviewed_at, kr.review_note
         FROM employee_kyc_update_requests kr
         JOIN employees e ON e.id = kr.employee_id
         LEFT JOIN users u ON u.id = kr.requested_by_user_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY kr.created_at DESC LIMIT 500`
      )
      .bind(...bindings)
      .all<Row>()
  ).results;
  return ok(c, { requests: rows });
});

kycRoutes.post("/:id/approve", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reviewNote = readString(body.review_note);
  await c.env.DB.prepare("UPDATE employee_kyc_update_requests SET status = 'APPROVED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), reviewNote || null, new Date().toISOString(), c.req.param("id")).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.approved",
    module: "employees",
    entityType: "kyc_request",
    entityId: c.req.param("id"),
    reason: reviewNote || null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.reviewed", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: c.req.param("id"), action: "kyc_request.approved" });
  return ok(c, { reviewed: true });
});

kycRoutes.post("/:id/reject", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reviewNote = readString(body.review_note);
  if (!reviewNote) return fail(c, 400, "REVIEW_NOTE_REQUIRED", "Review note is required when rejecting a KYC request.");
  await c.env.DB.prepare("UPDATE employee_kyc_update_requests SET status = 'REJECTED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), reviewNote || null, new Date().toISOString(), c.req.param("id")).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.rejected",
    module: "employees",
    entityType: "kyc_request",
    entityId: c.req.param("id"),
    reason: reviewNote || null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.reviewed", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: c.req.param("id"), action: "kyc_request.rejected" });
  return ok(c, { reviewed: true });
});
