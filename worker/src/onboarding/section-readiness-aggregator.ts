import { nowIso } from "../utils/http";
import { evaluateOnboardingSectionStatusesForKeys } from "./section-evaluators";
import {
  aggregateOnboardingReadinessFromSections,
  composeOnboardingSectionStatusRows,
  ensureOnboardingSectionStatusesSchema,
  getOnboardingSectionDefinitions,
  getOnboardingSectionStatuses,
  serializeOnboardingSectionStatus,
  upsertOnboardingSectionStatus,
  type OnboardingSectionStatusInput,
  type OnboardingSectionStatusRow
} from "./section-status";
import type { OnboardingSectionDefinition } from "./section-status-registry";

const DEFAULT_SECTION_STATUS_TIMEOUT_MS = 5000;
const SECTION_AGGREGATOR_SOURCE_VERSION = "section-status-phase3-aggregator";

export type FastOnboardingSectionReadinessOptions = {
  sectionKeys?: string[];
  retryFailed?: boolean;
  timeoutMs?: number;
  requestId?: string | null;
};

type SectionTiming = {
  section_key: string;
  section_label: string;
  status: "ready" | "failed" | "timeout" | "skipped";
  duration_ms: number;
  error_code?: string | null;
};

function uniqueSectionKeys(keys: string[] | undefined) {
  return Array.from(new Set((keys ?? []).map((key) => String(key ?? "").trim()).filter(Boolean)));
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, section: OnboardingSectionDefinition): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${section.section_label} timed out while rebuilding section readiness.`);
        error.name = "SECTION_STATUS_TIMEOUT";
        reject(error);
      }, timeoutMs);
    })
  ]);
}

async function getCaseEmployeeSnapshot(db: D1Database, caseId: string) {
  return db.prepare(`
    SELECT oc.employee_id, e.company_id
      FROM employee_onboarding_cases oc
      LEFT JOIN employees e ON e.id = oc.employee_id
     WHERE oc.id = ?
     LIMIT 1
  `).bind(caseId).first<{ employee_id: string | null; company_id: string | null }>();
}

function failedSectionStatusInput(input: {
  caseId: string;
  employeeId?: string | null;
  companyId?: string | null;
  definition: OnboardingSectionDefinition;
  actorUserId?: string | null;
  reasonCode: string;
  message: string;
  nextAction: string;
  requestId?: string | null;
}): OnboardingSectionStatusInput {
  return {
    case_id: input.caseId,
    employee_id: input.employeeId ?? null,
    company_id: input.companyId ?? null,
    section_key: input.definition.section_key,
    section_label: input.definition.section_label,
    status: "failed",
    is_required: input.definition.default_required,
    is_complete: false,
    is_verified: false,
    is_stale: false,
    status_reason_code: input.reasonCode,
    status_message: input.message,
    next_action: input.nextAction,
    missing_fields: [],
    blockers: [{
      type: input.reasonCode,
      message: input.message,
      next_action: input.nextAction,
      request_id: input.requestId ?? null
    }],
    field_status: {},
    source_version: SECTION_AGGREGATOR_SOURCE_VERSION,
    last_evaluated_at: nowIso(),
    updated_by_user_id: input.actorUserId ?? null
  };
}

function candidateReadinessPayload(input: {
  definitions: OnboardingSectionDefinition[];
  rows: OnboardingSectionStatusRow[];
  storedRowCount: number;
  caseId: string;
  durationMs?: number;
  rebuiltCount?: number;
  sectionTimings?: SectionTiming[];
  requestId?: string | null;
}) {
  const readiness = aggregateOnboardingReadinessFromSections(input.definitions, input.rows, input.caseId);
  const status = input.storedRowCount === 0 ? "not_checked" : readiness.status;
  return {
    ...readiness,
    status,
    readiness_status: status,
    mode: "section_status",
    shadow_only: false,
    can_activate: false,
    can_activate_candidate: status === "ready",
    activation_requires_final_verification: true,
    request_id: input.requestId ?? null,
    duration_ms: input.durationMs ?? null,
    rebuilt_sections: input.rebuiltCount ?? 0,
    section_timings: input.sectionTimings ?? [],
    reason: status === "ready"
      ? "Required setup sections are ready for final server verification."
      : status === "not_checked"
        ? "Setup readiness has not been checked yet."
        : "Setup readiness still has sections that need review."
  };
}

export async function getFastOnboardingSectionReadiness(
  db: D1Database,
  caseId: string,
  options: FastOnboardingSectionReadinessOptions = {}
) {
  const startedAt = Date.now();
  await ensureOnboardingSectionStatusesSchema(db);
  const definitions = await getOnboardingSectionDefinitions(db, caseId);
  const storedRows = await getOnboardingSectionStatuses(db, caseId);
  const requested = uniqueSectionKeys(options.sectionKeys);
  const filteredDefinitions = requested.length ? definitions.filter((definition) => requested.includes(definition.section_key)) : definitions;
  const previewRows = composeOnboardingSectionStatusRows(filteredDefinitions, storedRows, caseId);
  const readiness = candidateReadinessPayload({
    definitions: filteredDefinitions,
    rows: previewRows,
    storedRowCount: storedRows.length,
    caseId,
    durationMs: elapsedMs(startedAt),
    requestId: options.requestId ?? null
  });
  return {
    mode: "section_status",
    request_id: options.requestId ?? `section_readiness_${crypto.randomUUID()}`,
    duration_ms: elapsedMs(startedAt),
    readiness,
    sections: previewRows.map(serializeOnboardingSectionStatus),
    section_timings: [] as SectionTiming[],
    rebuilt_sections: 0,
    failed_count: 0,
    failed_sections: readiness.failed_sections ?? [],
    stale_sections: readiness.stale_sections ?? [],
    activation_requires_final_verification: true
  };
}

async function rebuildSection(db: D1Database, input: {
  caseId: string;
  definition: OnboardingSectionDefinition;
  actorUserId?: string | null;
  timeoutMs: number;
  requestId?: string | null;
  employeeId?: string | null;
  companyId?: string | null;
}) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      evaluateOnboardingSectionStatusesForKeys(db, input.caseId, [input.definition.section_key], input.actorUserId ?? null),
      input.timeoutMs,
      input.definition
    );
    const status = result.statuses[0] ?? failedSectionStatusInput({
      caseId: input.caseId,
      employeeId: input.employeeId ?? null,
      companyId: input.companyId ?? null,
      definition: input.definition,
      actorUserId: input.actorUserId ?? null,
      reasonCode: "SECTION_STATUS_NOT_RETURNED",
      message: `${input.definition.section_label} could not be checked because no section status was returned.`,
      nextAction: `Review the ${input.definition.section_label} setup and retry readiness.`,
      requestId: input.requestId ?? null
    });
    await upsertOnboardingSectionStatus(db, {
      ...status,
      source_version: SECTION_AGGREGATOR_SOURCE_VERSION,
      last_evaluated_at: nowIso(),
      updated_by_user_id: input.actorUserId ?? null
    });
    return {
      rebuilt: true,
      failed: status.status === "failed",
      timing: {
        section_key: input.definition.section_key,
        section_label: input.definition.section_label,
        status: status.status === "failed" ? "failed" : "ready",
        duration_ms: elapsedMs(startedAt),
        error_code: status.status_reason_code ?? null
      } satisfies SectionTiming
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "SECTION_STATUS_TIMEOUT";
    const reasonCode = timeout ? "SECTION_STATUS_TIMEOUT" : "SECTION_STATUS_REBUILD_FAILED";
    const message = timeout
      ? `${input.definition.section_label} took too long to check.`
      : `${input.definition.section_label} could not be checked safely.`;
    const nextAction = timeout
      ? `Review the ${input.definition.section_label} setup and retry readiness.`
      : `Fix the ${input.definition.section_label} setup and retry readiness.`;
    await upsertOnboardingSectionStatus(db, failedSectionStatusInput({
      caseId: input.caseId,
      employeeId: input.employeeId ?? null,
      companyId: input.companyId ?? null,
      definition: input.definition,
      actorUserId: input.actorUserId ?? null,
      reasonCode,
      message,
      nextAction,
      requestId: input.requestId ?? null
    }));
    return {
      rebuilt: true,
      failed: true,
      timing: {
        section_key: input.definition.section_key,
        section_label: input.definition.section_label,
        status: timeout ? "timeout" : "failed",
        duration_ms: elapsedMs(startedAt),
        error_code: reasonCode
      } satisfies SectionTiming
    };
  }
}

export async function rebuildAndAggregateOnboardingSectionReadiness(
  db: D1Database,
  caseId: string,
  actorUserId?: string | null,
  options: FastOnboardingSectionReadinessOptions = {}
) {
  const startedAt = Date.now();
  await ensureOnboardingSectionStatusesSchema(db);
  const definitions = await getOnboardingSectionDefinitions(db, caseId);
  const requested = uniqueSectionKeys(options.sectionKeys);
  const selectedDefinitions = requested.length ? definitions.filter((definition) => requested.includes(definition.section_key)) : definitions;
  const employee = await getCaseEmployeeSnapshot(db, caseId);
  const timeoutMs = Math.max(1000, Math.min(15000, Number(options.timeoutMs ?? DEFAULT_SECTION_STATUS_TIMEOUT_MS) || DEFAULT_SECTION_STATUS_TIMEOUT_MS));
  const sectionTimings: SectionTiming[] = [];
  let rebuiltCount = 0;

  for (const definition of selectedDefinitions) {
    const result = await rebuildSection(db, {
      caseId,
      definition,
      actorUserId: actorUserId ?? null,
      timeoutMs,
      requestId: options.requestId ?? null,
      employeeId: employee?.employee_id ?? null,
      companyId: employee?.company_id ?? null
    });
    if (result.rebuilt) rebuiltCount += 1;
    sectionTimings.push(result.timing);
  }

  const storedRows = await getOnboardingSectionStatuses(db, caseId);
  const previewRows = composeOnboardingSectionStatusRows(definitions, storedRows, caseId);
  const readiness = candidateReadinessPayload({
    definitions,
    rows: previewRows,
    storedRowCount: storedRows.length,
    caseId,
    durationMs: elapsedMs(startedAt),
    rebuiltCount,
    sectionTimings,
    requestId: options.requestId ?? null
  });

  return {
    mode: "section_status",
    request_id: options.requestId ?? `section_readiness_rebuild_${crypto.randomUUID()}`,
    rebuilt_count: rebuiltCount,
    rebuilt_sections: rebuiltCount,
    failed_count: sectionTimings.filter((timing) => ["failed", "timeout"].includes(timing.status)).length,
    failed_sections: readiness.failed_sections ?? [],
    stale_sections: readiness.stale_sections ?? [],
    section_timings: sectionTimings,
    duration_ms: elapsedMs(startedAt),
    readiness,
    sections: previewRows.map(serializeOnboardingSectionStatus),
    activation_requires_final_verification: true
  };
}

export async function rebuildStaleOrMissingOnboardingSectionReadiness(
  db: D1Database,
  caseId: string,
  actorUserId?: string | null,
  options: FastOnboardingSectionReadinessOptions = {}
) {
  await ensureOnboardingSectionStatusesSchema(db);
  const definitions = await getOnboardingSectionDefinitions(db, caseId);
  const storedRows = await getOnboardingSectionStatuses(db, caseId);
  const byKey = new Map(storedRows.map((row) => [row.section_key, row]));
  const requested = new Set(uniqueSectionKeys(options.sectionKeys));
  const rebuildKeys = definitions
    .filter((definition) => {
      if (requested.size && !requested.has(definition.section_key)) return false;
      const row = byKey.get(definition.section_key);
      if (!row) return true;
      if (row.status === "stale" || row.is_stale === 1 || row.status === "not_started") return true;
      if (options.retryFailed && row.status === "failed") return true;
      return false;
    })
    .map((definition) => definition.section_key);

  if (!rebuildKeys.length) {
    return getFastOnboardingSectionReadiness(db, caseId, options);
  }

  return rebuildAndAggregateOnboardingSectionReadiness(db, caseId, actorUserId ?? null, {
    ...options,
    sectionKeys: rebuildKeys
  });
}

export function compareOldAndSectionReadiness(oldReadiness: Record<string, unknown> | null | undefined, sectionReadiness: Record<string, unknown> | null | undefined) {
  const oldStatus = String(oldReadiness?.status ?? oldReadiness?.readiness_status ?? "");
  const sectionStatus = String(sectionReadiness?.status ?? sectionReadiness?.readiness_status ?? "");
  return {
    diagnostic_only: true,
    old_status: oldStatus || null,
    section_status: sectionStatus || null,
    old_can_activate: oldReadiness?.can_activate === true,
    section_can_activate_candidate: sectionReadiness?.can_activate_candidate === true,
    activation_requires_final_verification: true,
    statuses_match: Boolean(oldStatus && sectionStatus && oldStatus === sectionStatus)
  };
}
