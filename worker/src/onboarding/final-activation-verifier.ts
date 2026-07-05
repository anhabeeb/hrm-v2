import {
  rebuildAndAggregateOnboardingSectionReadiness,
  rebuildStaleOrMissingOnboardingSectionReadiness
} from "./section-readiness-aggregator";
import {
  aggregateOnboardingReadinessFromSections,
  composeOnboardingSectionStatusRows,
  ensureOnboardingSectionStatusesSchema,
  getOnboardingSectionDefinitions,
  getOnboardingSectionStatuses,
  parseStatusJsonArray,
  serializeOnboardingSectionStatus,
  upsertOnboardingSectionStatus,
  type OnboardingSectionStatusRow
} from "./section-status";
import { onboardingSectionDefinitionByKey } from "./section-status-registry";
import { nowIso } from "../utils/http";

const FINAL_VERIFICATION_SOURCE_VERSION = "section-status-phase4-final-activation-verifier";
const FINAL_VERIFICATION_TIMEOUT_MS = 7000;

type DbOrEnv = D1Database | { DB: D1Database };

type FinalVerificationStatus = "verified" | "blocked" | "failed" | "stale";

type ActivationCaseSnapshot = {
  case_id: string;
  employee_id: string | null;
  onboarding_status: string | null;
  activation_status: string | null;
  employee_archived_at: string | null;
  employee_status_key: string | null;
  employee_no: string | null;
  full_name: string | null;
  company_id: string | null;
};

export type FinalActivationSectionBlocker = {
  section_key: string;
  section_label: string;
  status?: string | null;
  message: string;
  next_action: string;
  error_code?: string | null;
  request_id?: string | null;
};

export type FinalActivationVerificationResult = {
  ok: boolean;
  status: FinalVerificationStatus;
  can_activate: boolean;
  activation_requires_final_verification: boolean;
  case_id: string;
  employee_id: string | null;
  verified_sections: Array<Record<string, unknown>>;
  blocking_sections: Array<Record<string, unknown>>;
  failed_sections: Array<Record<string, unknown>>;
  stale_sections: Array<Record<string, unknown>>;
  blockers: FinalActivationSectionBlocker[];
  warnings: FinalActivationSectionBlocker[];
  duration_ms: number;
  request_id: string;
  rebuilt_sections?: number;
  section_timings?: Array<Record<string, unknown>>;
};

export type FinalActivationVerifierOptions = {
  requestId?: string | null;
  timeoutMs?: number;
  dryRun?: boolean;
};

function dbFrom(input: DbOrEnv) {
  return "prepare" in input ? input : input.DB;
}

function safeText(value: unknown, fallback = "") {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = raw
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
    .replace(/\bSELECT\b[\s\S]*/gi, "The section check could not be completed")
    .replace(/stack trace[\s\S]*/gi, "The section check could not be completed")
    .replace(/password|token|secret|document number|account number|bank account|payroll amount/gi, "sensitive value")
    .slice(0, 240)
    .trim();
  return safe || fallback;
}

function elapsed(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

async function getActivationCaseSnapshot(db: D1Database, caseId: string) {
  return db.prepare(`
    SELECT
      oc.id AS case_id,
      oc.employee_id,
      oc.onboarding_status,
      oc.activation_status,
      e.archived_at AS employee_archived_at,
      e.employee_no,
      e.full_name,
      e.company_id,
      es.key AS employee_status_key
    FROM employee_onboarding_cases oc
    LEFT JOIN employees e ON e.id = oc.employee_id
    LEFT JOIN employee_statuses es ON es.id = e.status_id
    WHERE oc.id = ?
    LIMIT 1
  `).bind(caseId).first<ActivationCaseSnapshot>();
}

function blockerFromRow(row: OnboardingSectionStatusRow, requestId: string): FinalActivationSectionBlocker {
  const parsed = parseStatusJsonArray(row.blockers_json);
  const first = parsed.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const staleMessage = "This section changed and must be rechecked before activation.";
  const message = safeText(
    first?.message ?? row.status_message,
    row.status === "stale" || row.is_stale === 1 ? staleMessage : `${row.section_label} is not ready for activation.`
  );
  const nextAction = safeText(
    first?.next_action ?? row.next_action,
    row.status === "stale" || row.is_stale === 1
      ? `Recheck ${row.section_label} and run final verification again.`
      : `Complete ${row.section_label} and run final verification again.`
  );
  return {
    section_key: row.section_key,
    section_label: row.section_label,
    status: row.status,
    message,
    next_action: nextAction,
    error_code: row.status_reason_code ?? (typeof first?.type === "string" ? first.type : null),
    request_id: typeof first?.request_id === "string" ? first.request_id : requestId
  };
}

async function upsertFinalVerifierBlocker(db: D1Database, input: {
  caseId: string;
  employeeId?: string | null;
  companyId?: string | null;
  sectionKey: string;
  reasonCode: string;
  message: string;
  nextAction: string;
  actorUserId?: string | null;
  requestId: string;
}) {
  const definition = onboardingSectionDefinitionByKey(input.sectionKey);
  if (!definition) return;
  await upsertOnboardingSectionStatus(db, {
    case_id: input.caseId,
    employee_id: input.employeeId ?? null,
    company_id: input.companyId ?? null,
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: "blocked",
    is_required: true,
    is_complete: false,
    is_verified: false,
    is_stale: false,
    status_reason_code: input.reasonCode,
    status_message: safeText(input.message, `${definition.section_label} is blocked.`),
    next_action: safeText(input.nextAction, `Review ${definition.section_label} and run final verification again.`),
    missing_fields: [input.reasonCode],
    blockers: [{
      type: input.reasonCode,
      message: safeText(input.message),
      next_action: safeText(input.nextAction),
      request_id: input.requestId
    }],
    field_status: {},
    source_version: FINAL_VERIFICATION_SOURCE_VERSION,
    last_evaluated_at: nowIso(),
    updated_by_user_id: input.actorUserId ?? null
  });
}

async function applyFinalActivationHardChecks(db: D1Database, caseId: string, actorUserId: string | null, requestId: string) {
  const snapshot = await getActivationCaseSnapshot(db, caseId);
  if (!snapshot) return null;
  const employeeId = snapshot.employee_id ?? null;
  const companyId = snapshot.company_id ?? null;

  if (!employeeId) {
    await upsertFinalVerifierBlocker(db, {
      caseId,
      employeeId,
      companyId,
      sectionKey: "employee_info",
      reasonCode: "EMPLOYEE_NOT_ATTACHED",
      message: "This onboarding case is not attached to an employee.",
      nextAction: "Attach the onboarding case to the correct employee and run final verification again.",
      actorUserId,
      requestId
    });
  }

  if (snapshot.employee_archived_at) {
    await upsertFinalVerifierBlocker(db, {
      caseId,
      employeeId,
      companyId,
      sectionKey: "employee_info",
      reasonCode: "EMPLOYEE_ARCHIVED",
      message: "This employee record is archived and cannot be activated from onboarding.",
      nextAction: "Restore the employee record or create a new onboarding case if appropriate.",
      actorUserId,
      requestId
    });
  }

  if (["ACTIVATED", "OVERRIDDEN"].includes(String(snapshot.activation_status ?? "").toUpperCase())) {
    await upsertFinalVerifierBlocker(db, {
      caseId,
      employeeId,
      companyId,
      sectionKey: "employee_info",
      reasonCode: "ONBOARDING_ALREADY_ACTIVATED",
      message: "This onboarding case has already activated the employee.",
      nextAction: "Refresh the case list. No further activation action is required.",
      actorUserId,
      requestId
    });
  } else if (String(snapshot.employee_status_key ?? "").toUpperCase() === "ACTIVE") {
    await upsertFinalVerifierBlocker(db, {
      caseId,
      employeeId,
      companyId,
      sectionKey: "employee_info",
      reasonCode: "EMPLOYEE_ALREADY_ACTIVE",
      message: "This employee is already active outside this onboarding case.",
      nextAction: "Review the employee status before running activation again.",
      actorUserId,
      requestId
    });
  }

  return snapshot;
}

function classifyRows(rows: OnboardingSectionStatusRow[]) {
  const failed = rows.filter((row) => row.status === "failed");
  const stale = rows.filter((row) => row.status === "stale" || row.is_stale === 1);
  const blocking = rows.filter((row) =>
    row.is_required === 1 &&
    row.status !== "verified" &&
    row.status !== "complete" &&
    row.status !== "not_required" &&
    row.status !== "failed" &&
    row.status !== "stale"
  );
  const verified = rows.filter((row) => row.is_required === 1 && row.status === "verified" && row.is_verified === 1);
  return { failed, stale, blocking, verified };
}

async function buildFinalVerificationResult(db: D1Database, input: {
  caseId: string;
  actorUserId?: string | null;
  requestId: string;
  startedAt: number;
  rebuiltSections?: number;
  sectionTimings?: Array<Record<string, unknown>>;
  snapshot?: ActivationCaseSnapshot | null;
}): Promise<FinalActivationVerificationResult> {
  const definitions = await getOnboardingSectionDefinitions(db, input.caseId);
  const storedRows = await getOnboardingSectionStatuses(db, input.caseId);
  const rows = composeOnboardingSectionStatusRows(definitions, storedRows, input.caseId);
  const aggregate = aggregateOnboardingReadinessFromSections(definitions, rows, input.caseId);
  const { failed, stale, blocking, verified } = classifyRows(rows);
  const status: FinalVerificationStatus = failed.length ? "failed" : stale.length ? "stale" : blocking.length ? "blocked" : "verified";
  const blockerRows = status === "failed" ? failed : status === "stale" ? stale : blocking;
  const blockers = blockerRows.map((row) => blockerFromRow(row, input.requestId));

  return {
    ok: status !== "failed",
    status,
    can_activate: status === "verified",
    activation_requires_final_verification: status !== "verified",
    case_id: input.caseId,
    employee_id: input.snapshot?.employee_id ?? storedRows.find((row) => row.employee_id)?.employee_id ?? null,
    verified_sections: verified.map(serializeOnboardingSectionStatus),
    blocking_sections: blocking.map(serializeOnboardingSectionStatus),
    failed_sections: failed.map(serializeOnboardingSectionStatus),
    stale_sections: stale.map(serializeOnboardingSectionStatus),
    blockers: blockers.length ? blockers : (Array.isArray(aggregate.blockers) ? aggregate.blockers.map((item) => ({
      section_key: String((item as Record<string, unknown>).section_key ?? "readiness"),
      section_label: String((item as Record<string, unknown>).section_label ?? "Readiness"),
      status: typeof (item as Record<string, unknown>).status === "string" ? String((item as Record<string, unknown>).status) : null,
      message: safeText((item as Record<string, unknown>).message, "Onboarding setup is not ready for activation."),
      next_action: safeText((item as Record<string, unknown>).next_action, "Complete the missing setup and run final verification again."),
      error_code: typeof (item as Record<string, unknown>).type === "string" ? String((item as Record<string, unknown>).type) : null,
      request_id: input.requestId
    })) : []),
    warnings: [],
    duration_ms: elapsed(input.startedAt),
    request_id: input.requestId,
    rebuilt_sections: input.rebuiltSections ?? 0,
    section_timings: input.sectionTimings ?? []
  };
}

export async function rebuildStaleSectionsBeforeFinalVerification(
  envOrDb: DbOrEnv,
  caseId: string,
  actorUserId?: string | null,
  options: FinalActivationVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  await ensureOnboardingSectionStatusesSchema(db);
  return rebuildStaleOrMissingOnboardingSectionReadiness(db, caseId, actorUserId ?? null, {
    retryFailed: true,
    timeoutMs: options.timeoutMs ?? FINAL_VERIFICATION_TIMEOUT_MS,
    requestId: options.requestId ?? null
  });
}

export async function markSectionsVerified(
  envOrDb: DbOrEnv,
  caseId: string,
  actorUserId?: string | null
) {
  const db = dbFrom(envOrDb);
  await ensureOnboardingSectionStatusesSchema(db);
  const now = nowIso();
  const result = await db.prepare(`
    UPDATE onboarding_setup_section_statuses
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
     WHERE case_id = ?
       AND is_required = 1
       AND status = 'complete'
       AND is_complete = 1
       AND is_stale = 0
  `).bind(now, actorUserId ?? null, now, caseId).run();
  return Number(result.meta?.changes ?? 0);
}

export async function runFinalSectionVerification(
  envOrDb: DbOrEnv,
  caseId: string,
  actorUserId?: string | null,
  options: FinalActivationVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  const requestId = options.requestId ?? `final_verification_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  await ensureOnboardingSectionStatusesSchema(db);
  const definitions = await getOnboardingSectionDefinitions(db, caseId);
  const finalSectionKeys = definitions.map((definition) => definition.section_key);
  const rebuilt = await rebuildAndAggregateOnboardingSectionReadiness(db, caseId, actorUserId ?? null, {
    sectionKeys: finalSectionKeys,
    retryFailed: true,
    timeoutMs: options.timeoutMs ?? FINAL_VERIFICATION_TIMEOUT_MS,
    requestId
  });
  const snapshot = await applyFinalActivationHardChecks(db, caseId, actorUserId ?? null, requestId);
  await markSectionsVerified(db, caseId, actorUserId ?? null);
  return buildFinalVerificationResult(db, {
    caseId,
    actorUserId,
    requestId,
    startedAt,
    rebuiltSections: rebuilt.rebuilt_sections,
    sectionTimings: rebuilt.section_timings as Array<Record<string, unknown>>,
    snapshot
  });
}

export async function verifyOnboardingCaseForActivation(
  envOrDb: DbOrEnv,
  caseId: string,
  actorUserId?: string | null,
  options: FinalActivationVerifierOptions = {}
) {
  const db = dbFrom(envOrDb);
  const requestId = options.requestId ?? `final_verification_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  try {
    await ensureOnboardingSectionStatusesSchema(db);
    await rebuildStaleSectionsBeforeFinalVerification(db, caseId, actorUserId ?? null, { ...options, requestId });
    return await runFinalSectionVerification(db, caseId, actorUserId ?? null, { ...options, requestId });
  } catch (error) {
    const snapshot = await getActivationCaseSnapshot(db, caseId).catch(() => null);
    const message = safeText(
      error instanceof Error ? error.message : String(error ?? ""),
      "Final verification could not complete safely."
    );
    const failedSection: Record<string, unknown> = {
      section_key: "readiness",
      section_label: "Readiness",
      status: "failed",
      status_reason_code: "FINAL_VERIFICATION_FAILED",
      status_message: "Final verification could not complete safely.",
      next_action: "Retry final verification. If it fails again, share the request ID with support.",
      request_id: requestId
    };
    return {
      ok: false,
      status: "failed",
      can_activate: false,
      activation_requires_final_verification: true,
      case_id: caseId,
      employee_id: snapshot?.employee_id ?? null,
      verified_sections: [],
      blocking_sections: [],
      failed_sections: [failedSection],
      stale_sections: [],
      blockers: [{
        section_key: "readiness",
        section_label: "Readiness",
        status: "failed",
        message: "Final verification failed before activation could be checked.",
        next_action: "Retry final verification. If it fails again, share the request ID with support.",
        error_code: "FINAL_VERIFICATION_FAILED",
        request_id: requestId
      }],
      warnings: [{
        section_key: "readiness",
        section_label: "Readiness",
        status: "failed",
        message,
        next_action: "Share the request ID with support if retrying does not resolve the issue.",
        error_code: "FINAL_VERIFICATION_FAILED",
        request_id: requestId
      }],
      duration_ms: elapsed(startedAt),
      request_id: requestId,
      rebuilt_sections: 0,
      section_timings: []
    } satisfies FinalActivationVerificationResult;
  }
}

export function buildActivationBlockerResponse(verification: FinalActivationVerificationResult) {
  const failed = verification.status === "failed";
  const stale = verification.status === "stale";
  const code = failed
    ? "FINAL_VERIFICATION_FAILED"
    : stale
      ? "ONBOARDING_FINAL_VERIFICATION_STALE"
      : "ONBOARDING_FINAL_VERIFICATION_BLOCKED";
  const message = failed
    ? "Final verification failed before activation could continue."
    : stale
      ? "Final verification found stale onboarding setup that must be rechecked."
      : "Final verification found onboarding blockers.";
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
