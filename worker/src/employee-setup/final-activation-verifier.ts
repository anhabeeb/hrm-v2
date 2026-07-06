import {
  aggregateEmployeeSetupReadiness,
  composeEmployeeSetupSectionStatusRows,
  createEmployeeSetupEvaluationContext,
  ensureEmployeeSetupSectionStatusesSchema,
  getEmployeeSetupSectionStatuses,
  safeEvaluateEmployeeSetupSection,
  serializeEmployeeSetupSectionStatus,
  upsertEmployeeSetupSectionStatus,
  type EmployeeSetupSectionStatusInput,
  type EmployeeSetupSectionStatusRow
} from "./section-status";
import { employeeSetupSectionDefinitionByKey } from "./section-registry";
import { verifyDocumentDecisionForActivation } from "./document-requirement-decisions";
import { nowIso } from "../utils/http";

type DbOrEnv = D1Database | { DB: D1Database };

export type Employee360FinalVerificationStatus = "verified" | "blocked" | "failed" | "stale";

export type Employee360ActivationBlocker = {
  section_key: string;
  section_label: string;
  status?: string | null;
  message: string;
  next_action: string;
  error_code?: string | null;
  request_id?: string | null;
};

export type Employee360FinalActivationVerificationResult = {
  ok: boolean;
  status: Employee360FinalVerificationStatus;
  can_activate: boolean;
  activation_requires_final_verification: boolean;
  activation_requires_approval: boolean;
  activation_path: "direct_activation" | "approval_required" | "already_active" | "blocked";
  employee_id: string;
  verified_sections: Array<Record<string, unknown>>;
  blocking_sections: Array<Record<string, unknown>>;
  failed_sections: Array<Record<string, unknown>>;
  stale_sections: Array<Record<string, unknown>>;
  blockers: Employee360ActivationBlocker[];
  warnings: Employee360ActivationBlocker[];
  duration_ms: number;
  request_id: string;
  rebuilt_sections: number;
  section_timings: Array<Record<string, unknown>>;
  readiness: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
};

type Employee360FinalVerifierOptions = {
  requestId?: string | null;
  timeoutMs?: number | null;
  dryRun?: boolean;
};

type EmployeeActivationSnapshot = {
  id: string;
  employee_no: string | null;
  full_name: string | null;
  status_id: string;
  status_key: string | null;
  archived_at: string | null;
};

const FINAL_VERIFICATION_SOURCE_VERSION = "employee360-setup-phase4-final-activation-verifier";
const DEFAULT_TIMEOUT_MS = 7000;

function dbFrom(input: DbOrEnv) {
  return "prepare" in input ? input : input.DB;
}

function elapsed(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function safeText(value: unknown, fallback = "") {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = raw
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
    .replace(/\bSELECT\b[\s\S]*/gi, "The section check could not be completed")
    .replace(/stack trace[\s\S]*/gi, "The section check could not be completed")
    .replace(/password|token|secret|document number|account number|bank account|payroll amount|salary|file contents/gi, "sensitive value")
    .slice(0, 240)
    .trim();
  return safe || fallback;
}

function parseBlockers(row: EmployeeSetupSectionStatusRow) {
  if (!row.blockers_json) return [] as Record<string, unknown>[];
  try {
    const parsed = JSON.parse(row.blockers_json);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  } catch {
    return [];
  }
}

function blockerFromRow(row: EmployeeSetupSectionStatusRow, requestId: string): Employee360ActivationBlocker {
  const first = parseBlockers(row)[0];
  const stale = row.status === "stale" || row.is_stale === 1;
  const failed = row.status === "failed";
  return {
    section_key: row.section_key,
    section_label: row.section_label,
    status: row.status,
    message: safeText(
      first?.message ?? row.status_message,
      failed
        ? `${row.section_label} could not be checked safely.`
        : stale
          ? `${row.section_label} changed and must be rechecked before activation.`
          : `${row.section_label} is required before activation.`
    ),
    next_action: safeText(
      first?.next_action ?? row.next_action,
      stale
        ? `Recheck ${row.section_label} and run final verification again.`
        : `Complete ${row.section_label} and run final verification again.`
    ),
    error_code: row.status_reason_code ?? (typeof first?.type === "string" ? first.type : null),
    request_id: typeof first?.request_id === "string" ? first.request_id : requestId
  };
}

function statusId(employeeId: string, sectionKey: string) {
  return `employee_setup_section_${employeeId}_${sectionKey}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
}

async function getEmployeeActivationSnapshot(db: D1Database, employeeId: string) {
  return db.prepare(`
    SELECT e.id, e.employee_no, e.full_name, e.status_id, e.archived_at, es.key AS status_key
      FROM employees e
      LEFT JOIN employee_statuses es ON es.id = e.status_id
     WHERE e.id = ?
     LIMIT 1
  `).bind(employeeId).first<EmployeeActivationSnapshot>();
}

async function getActivationSettings(db: D1Database) {
  return db.prepare(`
    SELECT require_approval_before_activation, use_central_approval_workflow, allow_activation_override_with_reason
      FROM onboarding_settings
     WHERE id = 'onboarding_settings_default'
     LIMIT 1
  `).first<Record<string, unknown>>();
}

function bool(value: unknown, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

async function approvalRequiredForActivation(db: D1Database) {
  const settings = await getActivationSettings(db);
  return bool(settings?.use_central_approval_workflow, false);
}

function isPassingSection(row: EmployeeSetupSectionStatusRow) {
  if (row.is_stale === 1 || row.status === "stale" || row.status === "failed") return false;
  if (row.status === "not_required") return row.is_complete === 1;
  return row.status === "complete" || row.status === "verified";
}

function classifyRows(rows: EmployeeSetupSectionStatusRow[]) {
  const relevant = rows.filter((row) => row.section_key !== "final_verification");
  const failed = relevant.filter((row) => row.status === "failed");
  const stale = relevant.filter((row) => row.status === "stale" || row.is_stale === 1);
  const blocking = relevant.filter((row) => row.is_required === 1 && !isPassingSection(row) && row.status !== "failed" && row.status !== "stale");
  const verified = relevant.filter((row) => row.is_required === 1 && row.status === "verified" && row.is_verified === 1);
  return { failed, stale, blocking, verified };
}

async function upsertFinalVerificationSection(db: D1Database, input: {
  employeeId: string;
  status: Employee360FinalVerificationStatus;
  blockers: Employee360ActivationBlocker[];
  actorUserId?: string | null;
  requestId: string;
}) {
  const definition = employeeSetupSectionDefinitionByKey("final_verification");
  if (!definition) return;
  const now = nowIso();
  const complete = input.status === "verified";
  await upsertEmployeeSetupSectionStatus(db, {
    employee_id: input.employeeId,
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: input.status === "verified" ? "verified" : input.status,
    is_required: true,
    is_complete: complete,
    is_verified: complete,
    is_stale: input.status === "stale",
    status_reason_code: complete ? "FINAL_VERIFICATION_VERIFIED" : `FINAL_VERIFICATION_${input.status.toUpperCase()}`,
    status_message: complete ? "Final server verification passed." : "Final server verification found setup items that must be resolved before activation.",
    next_action: complete ? null : "Resolve the blockers and run final verification again.",
    missing_fields: complete ? [] : input.blockers.map((blocker) => blocker.section_key),
    blockers: input.blockers,
    field_status: { request_id: input.requestId, final_verification: input.status },
    source_version: FINAL_VERIFICATION_SOURCE_VERSION,
    last_evaluated_at: now,
    last_verified_at: complete ? now : null,
    updated_by_user_id: input.actorUserId ?? null
  });
}

function statusInputWithSafeFailure(employeeId: string, actorUserId: string | null | undefined, sectionKey: string, error: unknown, requestId: string): EmployeeSetupSectionStatusInput | null {
  const definition = employeeSetupSectionDefinitionByKey(sectionKey);
  if (!definition) return null;
  const safe = safeText(error instanceof Error ? error.message : String(error ?? ""), "The section check could not be completed.");
  return {
    employee_id: employeeId,
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: "failed",
    is_required: definition.default_required,
    is_complete: false,
    is_verified: false,
    is_stale: false,
    status_reason_code: "EMPLOYEE360_FINAL_SECTION_FAILED",
    status_message: `${definition.section_label} could not be checked safely.`,
    next_action: `Review ${definition.section_label} and run final verification again.`,
    blockers: [{
      type: "EMPLOYEE360_FINAL_SECTION_FAILED",
      message: `${definition.section_label} could not be checked safely.`,
      next_action: `Review ${definition.section_label} and run final verification again.`,
      request_id: requestId
    }],
    field_status: { safe_log_message: safe, request_id: requestId },
    source_version: FINAL_VERIFICATION_SOURCE_VERSION,
    last_evaluated_at: nowIso(),
    updated_by_user_id: actorUserId ?? null
  };
}

async function extraDocumentDecisionAuditCheck(db: D1Database, employeeId: string, actorUserId: string | null | undefined, requestId: string) {
  const verification = await verifyDocumentDecisionForActivation(db, employeeId);
  const waiverLike = verification.decisions.filter((decision) => ["waived", "exempted"].includes(decision.status));
  const invalid: Employee360ActivationBlocker[] = [];
  for (const row of waiverLike) {
    const decision = row.decision;
    if (!decision || decision.approval_status !== "APPROVED" || !decision.decided_by_user_id || !decision.reason) {
      invalid.push({
        section_key: "documents",
        section_label: "Documents",
        status: "blocked",
        message: `${row.document_type_name} waiver or exemption is missing approval metadata.`,
        next_action: `Review ${row.document_type_name} and upload the document or record an approved decision again.`,
        error_code: "DOCUMENT_WAIVER_APPROVAL_METADATA_MISSING",
        request_id: requestId
      });
      continue;
    }
    const audit = await db.prepare(`
      SELECT id
        FROM audit_logs
       WHERE module = 'documents'
         AND entity_type = 'employee_document_requirement_decision'
         AND entity_id = ?
         AND action = 'document.requirement.waived'
       ORDER BY created_at DESC
       LIMIT 1
    `).bind(`${employeeId}:${row.document_type_id}`).first<{ id: string }>();
    if (!audit) {
      invalid.push({
        section_key: "documents",
        section_label: "Documents",
        status: "blocked",
        message: `${row.document_type_name} waiver or exemption is missing an audit trail.`,
        next_action: `Review ${row.document_type_name} and record the waiver/exemption again so it is audited.`,
        error_code: "DOCUMENT_WAIVER_AUDIT_MISSING",
        request_id: requestId
      });
    }
  }
  if (!verification.ok || invalid.length) {
    const definition = employeeSetupSectionDefinitionByKey("documents");
    await upsertEmployeeSetupSectionStatus(db, {
      employee_id: employeeId,
      section_key: "documents",
      section_label: definition?.section_label ?? "Documents",
      status: "blocked",
      is_required: true,
      is_complete: false,
      is_verified: false,
      is_stale: false,
      status_reason_code: "DOCUMENT_REQUIREMENT_DECISION_BLOCKED",
      status_message: "Required employee documents are missing.",
      next_action: "Upload required documents or resolve document requirement decisions and run final verification again.",
      missing_fields: [...verification.blockers.map((blocker) => blocker.document_type_name), ...invalid.map((blocker) => blocker.error_code)].filter(Boolean),
      blockers: [...verification.blockers, ...invalid],
      field_status: { document_required_rules: "decision_gate", request_id: requestId },
      source_version: FINAL_VERIFICATION_SOURCE_VERSION,
      last_evaluated_at: nowIso(),
      updated_by_user_id: actorUserId ?? null
    });
  }
}

export async function rebuildStaleEmployeeSetupSectionsBeforeFinalVerification(
  envOrDb: DbOrEnv,
  employeeId: string,
  actorUserId?: string | null,
  options: Employee360FinalVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const requestId = options.requestId ?? `employee360_final_rebuild_${crypto.randomUUID()}`;
  const { definitions, context } = await createEmployeeSetupEvaluationContext(db, employeeId, actorUserId ?? null);
  const storedRows = await getEmployeeSetupSectionStatuses(db, employeeId);
  const byKey = new Map(storedRows.map((row) => [row.section_key, row]));
  const keysToRebuild = definitions
    .filter((definition) => definition.section_key !== "final_verification")
    .filter((definition) => {
      const row = byKey.get(definition.section_key);
      if (!row) return definition.default_required;
      if (row.is_required !== 1) return false;
      return row.status === "not_started" || row.status === "stale" || row.status === "failed" || row.is_stale === 1;
    });
  const statuses: EmployeeSetupSectionStatusInput[] = [];
  const startedAt = Date.now();
  for (const definition of keysToRebuild) {
    const sectionStartedAt = Date.now();
    try {
      const status = await safeEvaluateEmployeeSetupSection(definition, context);
      status.source_version = FINAL_VERIFICATION_SOURCE_VERSION;
      status.last_evaluated_at = nowIso();
      statuses.push(status);
    } catch (error) {
      const failed = statusInputWithSafeFailure(employeeId, actorUserId, definition.section_key, error, requestId);
      if (failed) statuses.push(failed);
    }
    if (elapsed(startedAt) > (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)) break;
    void sectionStartedAt;
  }
  for (const status of statuses) await upsertEmployeeSetupSectionStatus(db, status);
  return {
    rebuilt_sections: statuses.length,
    rebuilt_statuses: statuses.map((status) => ({ section_key: status.section_key, status: status.status })),
    duration_ms: elapsed(startedAt)
  };
}

export async function runEmployeeSetupFinalSectionVerification(
  envOrDb: DbOrEnv,
  employeeId: string,
  actorUserId?: string | null,
  options: Employee360FinalVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  const requestId = options.requestId ?? `employee360_final_verification_${crypto.randomUUID()}`;
  const { definitions, context } = await createEmployeeSetupEvaluationContext(db, employeeId, actorUserId ?? null);
  const statuses: EmployeeSetupSectionStatusInput[] = [];
  const timings: Array<Record<string, unknown>> = [];
  const startedAt = Date.now();
  for (const definition of definitions.filter((item) => item.section_key !== "final_verification")) {
    const sectionStartedAt = Date.now();
    try {
      const status = await safeEvaluateEmployeeSetupSection(definition, context);
      status.source_version = FINAL_VERIFICATION_SOURCE_VERSION;
      status.last_evaluated_at = nowIso();
      statuses.push(status);
      timings.push({ section_key: definition.section_key, status: status.status, duration_ms: elapsed(sectionStartedAt) });
    } catch (error) {
      const failed = statusInputWithSafeFailure(employeeId, actorUserId, definition.section_key, error, requestId);
      if (failed) statuses.push(failed);
      timings.push({ section_key: definition.section_key, status: "failed", duration_ms: elapsed(sectionStartedAt) });
    }
    if (elapsed(startedAt) > (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)) {
      const failed = statusInputWithSafeFailure(employeeId, actorUserId, definition.section_key, "Final verification section timeout.", requestId);
      if (failed) {
        failed.status_reason_code = "EMPLOYEE360_FINAL_SECTION_TIMEOUT";
        failed.status_message = `${definition.section_label} took too long to verify.`;
        failed.next_action = `Retry final verification. If it fails again, review ${definition.section_label}.`;
        statuses.push(failed);
      }
      break;
    }
  }
  for (const status of statuses) await upsertEmployeeSetupSectionStatus(db, status);
  await extraDocumentDecisionAuditCheck(db, employeeId, actorUserId ?? null, requestId);
  return {
    verified_statuses: statuses,
    section_timings: timings,
    duration_ms: elapsed(startedAt)
  };
}

export async function markEmployeeSetupSectionsVerified(
  envOrDb: DbOrEnv,
  employeeId: string,
  actorUserId?: string | null
) {
  const db = dbFrom(envOrDb);
  const now = nowIso();
  const result = await db.prepare(`
    UPDATE employee_setup_section_statuses
       SET status = 'verified',
           is_verified = 1,
           is_complete = 1,
           is_stale = 0,
           status_reason_code = 'FINAL_VERIFICATION_SECTION_VERIFIED',
           status_message = section_label || ' verified for activation.',
           next_action = NULL,
           last_verified_at = ?,
           updated_by_user_id = ?,
           updated_at = ?
     WHERE employee_id = ?
       AND section_key != 'final_verification'
       AND is_required = 1
       AND status = 'complete'
       AND is_complete = 1
       AND is_stale = 0
  `).bind(now, actorUserId ?? null, now, employeeId).run();
  return Number(result.meta?.changes ?? 0);
}

async function buildFinalVerificationResult(db: D1Database, input: {
  employeeId: string;
  actorUserId?: string | null;
  requestId: string;
  startedAt: number;
  rebuiltSections: number;
  sectionTimings: Array<Record<string, unknown>>;
}): Promise<Employee360FinalActivationVerificationResult> {
  const [definitions, storedRows, employee, approvalRequired] = await Promise.all([
    createEmployeeSetupEvaluationContext(db, input.employeeId, input.actorUserId ?? null).then((value) => value.definitions),
    getEmployeeSetupSectionStatuses(db, input.employeeId),
    getEmployeeActivationSnapshot(db, input.employeeId),
    approvalRequiredForActivation(db)
  ]);
  const rows = composeEmployeeSetupSectionStatusRows(definitions, storedRows, input.employeeId);
  const hardBlockers: Employee360ActivationBlocker[] = [];
  if (!employee) {
    hardBlockers.push({
      section_key: "profile_information",
      section_label: "Profile Information",
      status: "blocked",
      message: "Employee record could not be found.",
      next_action: "Refresh the employee list and open Employee 360 again.",
      error_code: "EMPLOYEE_NOT_FOUND",
      request_id: input.requestId
    });
  } else if (employee.archived_at) {
    hardBlockers.push({
      section_key: "profile_information",
      section_label: "Profile Information",
      status: "blocked",
      message: "This employee record is archived and cannot be activated.",
      next_action: "Restore the employee record or create a new employee if appropriate.",
      error_code: "EMPLOYEE_ARCHIVED",
      request_id: input.requestId
    });
  }

  const { failed, stale, blocking, verified } = classifyRows(rows);
  const rowBlockers = [
    ...failed.map((row) => blockerFromRow(row, input.requestId)),
    ...stale.map((row) => blockerFromRow(row, input.requestId)),
    ...blocking.map((row) => blockerFromRow(row, input.requestId))
  ];
  const failedRows = failed.map(serializeEmployeeSetupSectionStatus);
  const staleRows = stale.map(serializeEmployeeSetupSectionStatus);
  const blockingRows = blocking.map(serializeEmployeeSetupSectionStatus);
  const alreadyActive = String(employee?.status_key ?? "").toUpperCase() === "ACTIVE";
  const status: Employee360FinalVerificationStatus = hardBlockers.length || rowBlockers.length
    ? failed.length ? "failed" : stale.length ? "stale" : "blocked"
    : "verified";
  const blockers = [...hardBlockers, ...rowBlockers];
  const canActivate = status === "verified";
  const previewRows = composeEmployeeSetupSectionStatusRows(definitions, await getEmployeeSetupSectionStatuses(db, input.employeeId), input.employeeId);
  const readiness = aggregateEmployeeSetupReadiness(definitions, previewRows, input.employeeId);
  const activationPath = !canActivate
    ? "blocked"
    : alreadyActive
      ? "already_active"
      : approvalRequired
        ? "approval_required"
        : "direct_activation";

  return {
    ok: status !== "failed",
    status,
    can_activate: canActivate,
    activation_requires_final_verification: status !== "verified",
    activation_requires_approval: approvalRequired,
    activation_path: activationPath,
    employee_id: input.employeeId,
    verified_sections: verified.map(serializeEmployeeSetupSectionStatus),
    blocking_sections: blockingRows,
    failed_sections: failedRows,
    stale_sections: staleRows,
    blockers,
    warnings: alreadyActive ? [{
      section_key: "profile_information",
      section_label: "Profile Information",
      status: "verified",
      message: "Employee is already active. Verification is idempotent.",
      next_action: "No activation action is required.",
      error_code: "EMPLOYEE_ALREADY_ACTIVE",
      request_id: input.requestId
    }] : [],
    duration_ms: elapsed(input.startedAt),
    request_id: input.requestId,
    rebuilt_sections: input.rebuiltSections,
    section_timings: input.sectionTimings,
    readiness,
    sections: previewRows.map(serializeEmployeeSetupSectionStatus)
  };
}

export async function verifyEmployee360SetupForActivation(
  envOrDb: DbOrEnv,
  employeeId: string,
  actorUserId?: string | null,
  options: Employee360FinalVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  const requestId = options.requestId ?? `employee360_final_verification_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  try {
    await ensureEmployeeSetupSectionStatusesSchema(db);
    const staleResult = await rebuildStaleEmployeeSetupSectionsBeforeFinalVerification(db, employeeId, actorUserId ?? null, { ...options, requestId });
    const finalResult = await runEmployeeSetupFinalSectionVerification(db, employeeId, actorUserId ?? null, { ...options, requestId });
    let result = await buildFinalVerificationResult(db, {
      employeeId,
      actorUserId,
      requestId,
      startedAt,
      rebuiltSections: staleResult.rebuilt_sections,
      sectionTimings: finalResult.section_timings
    });
    if (result.status === "verified") {
      await markEmployeeSetupSectionsVerified(db, employeeId, actorUserId ?? null);
    }
    await upsertFinalVerificationSection(db, {
      employeeId,
      status: result.status,
      blockers: result.blockers,
      actorUserId,
      requestId
    });
    result = await buildFinalVerificationResult(db, {
      employeeId,
      actorUserId,
      requestId,
      startedAt,
      rebuiltSections: staleResult.rebuilt_sections,
      sectionTimings: finalResult.section_timings
    });
    return result;
  } catch (error) {
    const safe = buildEmployeeActivationBlockerResponse({
      ok: false,
      status: "failed",
      can_activate: false,
      activation_requires_final_verification: true,
      activation_requires_approval: false,
      activation_path: "blocked",
      employee_id: employeeId,
      verified_sections: [],
      blocking_sections: [],
      failed_sections: [],
      stale_sections: [],
      blockers: [],
      warnings: [],
      duration_ms: elapsed(startedAt),
      request_id: requestId,
      rebuilt_sections: 0,
      section_timings: [],
      readiness: {},
      sections: []
    }, error);
    const definition = employeeSetupSectionDefinitionByKey("final_verification");
    await upsertEmployeeSetupSectionStatus(db, {
      employee_id: employeeId,
      section_key: "final_verification",
      section_label: definition?.section_label ?? "Final Verification",
      status: "failed",
      is_required: true,
      is_complete: false,
      is_verified: false,
      is_stale: false,
      status_reason_code: "FINAL_VERIFICATION_FAILED",
      status_message: safe.message,
      next_action: "Retry final verification. If it fails again, share the request ID with support.",
      blockers: [{
        type: "FINAL_VERIFICATION_FAILED",
        message: safe.message,
        next_action: "Retry final verification. If it fails again, share the request ID with support.",
        request_id: requestId
      }],
      field_status: { request_id: requestId },
      source_version: FINAL_VERIFICATION_SOURCE_VERSION,
      last_evaluated_at: nowIso(),
      updated_by_user_id: actorUserId ?? null
    });
    return {
      ok: false,
      status: "failed",
      can_activate: false,
      activation_requires_final_verification: true,
      activation_requires_approval: false,
      activation_path: "blocked",
      employee_id: employeeId,
      verified_sections: [],
      blocking_sections: [],
      failed_sections: [{
        section_key: "final_verification",
        section_label: "Final Verification",
        status: "failed",
        status_reason_code: "FINAL_VERIFICATION_FAILED",
        status_message: safe.message,
        next_action: "Retry final verification. If it fails again, share the request ID with support.",
        request_id: requestId
      }],
      stale_sections: [],
      blockers: [{
        section_key: "final_verification",
        section_label: "Final Verification",
        status: "failed",
        message: safe.message,
        next_action: "Retry final verification. If it fails again, share the request ID with support.",
        error_code: "FINAL_VERIFICATION_FAILED",
        request_id: requestId
      }],
      warnings: [],
      duration_ms: elapsed(startedAt),
      request_id: requestId,
      rebuilt_sections: 0,
      section_timings: [],
      readiness: {},
      sections: []
    } satisfies Employee360FinalActivationVerificationResult;
  }
}

export function buildEmployeeActivationBlockerResponse(verification: Employee360FinalActivationVerificationResult, error?: unknown) {
  const failed = verification.status === "failed";
  const stale = verification.status === "stale";
  const code = failed
    ? "FINAL_VERIFICATION_FAILED"
    : stale
      ? "EMPLOYEE360_FINAL_VERIFICATION_STALE"
      : "EMPLOYEE360_FINAL_VERIFICATION_BLOCKED";
  const message = failed
    ? safeText(error instanceof Error ? error.message : error, "Final verification failed before activation could continue.")
    : stale
      ? "Final verification found stale Employee 360 setup that must be rechecked."
      : "Final verification found Employee 360 setup blockers.";
  return {
    code,
    message,
    request_id: verification.request_id,
    action_errors: verification.blockers.map((blocker) => `${blocker.section_label}: ${blocker.message}`),
    details: {
      verification,
      blockers: verification.blockers,
      failed_sections: verification.failed_sections,
      stale_sections: verification.stale_sections
    }
  };
}
