import { isOperationalModuleEnabled } from "../utils/module-enforcement";
import { nowIso } from "../utils/http";
import {
  getOnboardingSectionRegistry,
  ONBOARDING_SECTION_DEFINITIONS,
  onboardingSectionDefinitionByKey,
  type OnboardingSectionDefinition,
  type OnboardingSectionStatusValue
} from "./section-status-registry";
import { evaluateOnboardingSectionStatuses } from "./section-evaluators";

export type OnboardingSectionStatusInput = {
  case_id: string;
  employee_id?: string | null;
  company_id?: string | null;
  section_key: string;
  section_label: string;
  status: OnboardingSectionStatusValue;
  is_required?: boolean;
  is_complete?: boolean;
  is_verified?: boolean;
  is_stale?: boolean;
  status_reason_code?: string | null;
  status_message?: string | null;
  next_action?: string | null;
  missing_fields?: unknown;
  blockers?: unknown;
  field_status?: unknown;
  source_version?: string | null;
  source_hash?: string | null;
  last_saved_at?: string | null;
  last_evaluated_at?: string | null;
  last_verified_at?: string | null;
  updated_by_user_id?: string | null;
};

export type OnboardingSectionStatusRow = {
  id: string;
  case_id: string;
  employee_id: string | null;
  company_id: string | null;
  section_key: string;
  section_label: string;
  status: OnboardingSectionStatusValue;
  is_required: number;
  is_complete: number;
  is_verified: number;
  is_stale: number;
  status_reason_code: string | null;
  status_message: string | null;
  next_action: string | null;
  missing_fields_json: string | null;
  blockers_json: string | null;
  field_status_json: string | null;
  source_version: string | null;
  source_hash: string | null;
  last_saved_at: string | null;
  last_evaluated_at: string | null;
  last_verified_at: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

const SECTION_STATUS_COLUMNS = `
  id, case_id, employee_id, company_id, section_key, section_label, status,
  is_required, is_complete, is_verified, is_stale, status_reason_code,
  status_message, next_action, missing_fields_json, blockers_json,
  field_status_json, source_version, source_hash, last_saved_at,
  last_evaluated_at, last_verified_at, updated_by_user_id, created_at, updated_at
`;

export function safeJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
}

export function parseStatusJsonArray(value: string | null | undefined) {
  if (!value) return [] as unknown[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseStatusJsonObject(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function ensureOnboardingSectionStatusesSchema(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS onboarding_setup_section_statuses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      employee_id TEXT,
      company_id TEXT,
      section_key TEXT NOT NULL,
      section_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('not_started', 'incomplete', 'complete', 'blocked', 'not_required', 'failed', 'stale', 'verified')),
      is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
      is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
      is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
      is_stale INTEGER NOT NULL DEFAULT 0 CHECK (is_stale IN (0, 1)),
      status_reason_code TEXT,
      status_message TEXT,
      next_action TEXT,
      missing_fields_json TEXT,
      blockers_json TEXT,
      field_status_json TEXT,
      source_version TEXT,
      source_hash TEXT,
      last_saved_at TEXT,
      last_evaluated_at TEXT,
      last_verified_at TEXT,
      updated_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (case_id, section_key)
    )
  `).run();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_case ON onboarding_setup_section_statuses(case_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_employee ON onboarding_setup_section_statuses(employee_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_company ON onboarding_setup_section_statuses(company_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_status ON onboarding_setup_section_statuses(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_case_status ON onboarding_setup_section_statuses(case_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_case_required_complete ON onboarding_setup_section_statuses(case_id, is_required, is_complete)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_setup_section_statuses_case_stale ON onboarding_setup_section_statuses(case_id, is_stale)")
  ]);
}

async function getOnboardingSettings(db: D1Database) {
  return db.prepare("SELECT * FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>();
}

async function getOnboardingModuleStatuses(db: D1Database) {
  const keys = [
    "employees",
    "contracts",
    "documents",
    "document_compliance",
    "payroll",
    "payment_methods",
    "payment_institutions",
    "pension",
    "attendance",
    "roster",
    "assets_uniforms",
    "self_service",
    "approvals"
  ];
  const pairs = await Promise.all(keys.map(async (key) => [key, await isOperationalModuleEnabled(db, key)] as const));
  return Object.fromEntries(pairs) as Record<string, boolean>;
}

async function getOnboardingCaseEmployee(db: D1Database, caseId: string) {
  return db.prepare(`
    SELECT
      oc.id AS case_id,
      oc.employee_id,
      oc.onboarding_status,
      oc.activation_status,
      e.full_name,
      e.employee_no,
      e.employee_type,
      e.employment_type,
      e.primary_department_id,
      e.primary_location_id,
      e.primary_position_id,
      e.job_level_id,
      e.reporting_manager_employee_id,
      e.joining_date,
      e.user_id,
      e.payroll_included,
      e.roster_eligible
    FROM employee_onboarding_cases oc
    INNER JOIN employees e ON e.id = oc.employee_id
    WHERE oc.id = ? AND e.archived_at IS NULL
    LIMIT 1
  `).bind(caseId).first<Record<string, unknown>>();
}

export async function getOnboardingSectionDefinitions(db: D1Database, caseId?: string) {
  const [settings, moduleStatuses, employee] = await Promise.all([
    getOnboardingSettings(db),
    getOnboardingModuleStatuses(db),
    caseId ? getOnboardingCaseEmployee(db, caseId) : Promise.resolve(null)
  ]);
  return getOnboardingSectionRegistry({ settings, moduleStatuses, employee });
}

function stableStatusId(caseId: string, sectionKey: string) {
  return `onboarding_section_${caseId}_${sectionKey}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function boolInt(value: unknown) {
  return value === true || value === 1 ? 1 : 0;
}

export async function upsertOnboardingSectionStatus(db: D1Database, input: OnboardingSectionStatusInput) {
  await ensureOnboardingSectionStatusesSchema(db);
  const now = nowIso();
  const isComplete = input.is_complete ?? (input.status === "complete" || input.status === "verified" || input.status === "not_required");
  const isVerified = input.is_verified ?? input.status === "verified";
  const isStale = input.is_stale ?? input.status === "stale";
  const isRequired = input.is_required ?? input.status !== "not_required";
  await db.prepare(`
    INSERT INTO onboarding_setup_section_statuses
      (id, case_id, employee_id, company_id, section_key, section_label, status,
       is_required, is_complete, is_verified, is_stale, status_reason_code,
       status_message, next_action, missing_fields_json, blockers_json,
       field_status_json, source_version, source_hash, last_saved_at,
       last_evaluated_at, last_verified_at, updated_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(case_id, section_key) DO UPDATE SET
      employee_id = excluded.employee_id,
      company_id = excluded.company_id,
      section_label = excluded.section_label,
      status = excluded.status,
      is_required = excluded.is_required,
      is_complete = excluded.is_complete,
      is_verified = excluded.is_verified,
      is_stale = excluded.is_stale,
      status_reason_code = excluded.status_reason_code,
      status_message = excluded.status_message,
      next_action = excluded.next_action,
      missing_fields_json = excluded.missing_fields_json,
      blockers_json = excluded.blockers_json,
      field_status_json = excluded.field_status_json,
      source_version = excluded.source_version,
      source_hash = excluded.source_hash,
      last_saved_at = COALESCE(excluded.last_saved_at, onboarding_setup_section_statuses.last_saved_at),
      last_evaluated_at = excluded.last_evaluated_at,
      last_verified_at = COALESCE(excluded.last_verified_at, onboarding_setup_section_statuses.last_verified_at),
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    stableStatusId(input.case_id, input.section_key),
    input.case_id,
    input.employee_id ?? null,
    input.company_id ?? null,
    input.section_key,
    input.section_label,
    input.status,
    boolInt(isRequired),
    boolInt(isComplete),
    boolInt(isVerified),
    boolInt(isStale),
    input.status_reason_code ?? null,
    input.status_message ?? null,
    input.next_action ?? null,
    safeJson(input.missing_fields ?? []),
    safeJson(input.blockers ?? []),
    safeJson(input.field_status ?? {}),
    input.source_version ?? "section-status-phase1",
    input.source_hash ?? null,
    input.last_saved_at ?? null,
    input.last_evaluated_at ?? now,
    input.last_verified_at ?? null,
    input.updated_by_user_id ?? null,
    now,
    now
  ).run();
}

export async function getOnboardingSectionStatuses(db: D1Database, caseId: string) {
  await ensureOnboardingSectionStatusesSchema(db);
  const rows = await db.prepare(`
    SELECT ${SECTION_STATUS_COLUMNS}
      FROM onboarding_setup_section_statuses
     WHERE case_id = ?
     ORDER BY section_key
     LIMIT 50
  `).bind(caseId).all<OnboardingSectionStatusRow>();
  const order = new Map(ONBOARDING_SECTION_DEFINITIONS.map((definition) => [definition.section_key, definition.display_order]));
  return rows.results.sort((a, b) => (order.get(a.section_key) ?? 999) - (order.get(b.section_key) ?? 999));
}

function statusForMissingDefinition(definition: OnboardingSectionDefinition, caseId: string): OnboardingSectionStatusRow {
  const now = nowIso();
  const required = definition.default_required ? 1 : 0;
  return {
    id: stableStatusId(caseId, definition.section_key),
    case_id: caseId,
    employee_id: null,
    company_id: null,
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: required ? "not_started" : "not_required",
    is_required: required,
    is_complete: required ? 0 : 1,
    is_verified: 0,
    is_stale: 0,
    status_reason_code: required ? "SECTION_NOT_EVALUATED" : "SECTION_NOT_REQUIRED",
    status_message: required ? "This section has not been checked in the new preview system yet." : "This section is not required for onboarding activation.",
    next_action: required ? "Rebuild section status preview." : null,
    missing_fields_json: "[]",
    blockers_json: required ? JSON.stringify([{ type: "SECTION_NOT_EVALUATED", message: "This section has not been evaluated yet." }]) : "[]",
    field_status_json: "{}",
    source_version: "section-status-phase1",
    source_hash: null,
    last_saved_at: null,
    last_evaluated_at: null,
    last_verified_at: null,
    updated_by_user_id: null,
    created_at: now,
    updated_at: now
  };
}

export function composeOnboardingSectionStatusRows(definitions: OnboardingSectionDefinition[], rows: OnboardingSectionStatusRow[], caseId: string) {
  const byKey = new Map(rows.map((row) => [row.section_key, row]));
  return definitions.map((definition) => byKey.get(definition.section_key) ?? statusForMissingDefinition(definition, caseId));
}

export function serializeOnboardingSectionStatus(row: OnboardingSectionStatusRow) {
  return {
    section_key: row.section_key,
    section_label: row.section_label,
    status: row.status,
    is_required: row.is_required === 1,
    is_complete: row.is_complete === 1,
    is_verified: row.is_verified === 1,
    is_stale: row.is_stale === 1,
    status_reason_code: row.status_reason_code,
    status_message: row.status_message,
    next_action: row.next_action,
    missing_fields: parseStatusJsonArray(row.missing_fields_json),
    blockers: parseStatusJsonArray(row.blockers_json),
    field_status: parseStatusJsonObject(row.field_status_json),
    source_version: row.source_version,
    last_saved_at: row.last_saved_at,
    last_evaluated_at: row.last_evaluated_at,
    last_verified_at: row.last_verified_at,
    updated_at: row.updated_at
  };
}

export function aggregateOnboardingReadinessFromSections(definitions: OnboardingSectionDefinition[], rows: OnboardingSectionStatusRow[], caseId = rows[0]?.case_id ?? "") {
  const completeStatuses = new Set<OnboardingSectionStatusValue>(["complete", "verified", "not_required"]);
  const failedSections: OnboardingSectionStatusRow[] = [];
  const staleSections: OnboardingSectionStatusRow[] = [];
  const blockingSections: OnboardingSectionStatusRow[] = [];
  const passingSections: OnboardingSectionStatusRow[] = [];
  const allRows = composeOnboardingSectionStatusRows(definitions, rows, caseId);

  for (const row of allRows) {
    if (row.status === "failed") failedSections.push(row);
    else if (row.status === "stale" || row.is_stale === 1) staleSections.push(row);
    else if (completeStatuses.has(row.status) && row.is_complete === 1) passingSections.push(row);
    else if (row.is_required === 1) blockingSections.push(row);
  }

  const status = failedSections.length ? "failed" : staleSections.length ? "stale" : blockingSections.length ? "blocked" : "ready";
  const blockerRows = [...blockingSections, ...failedSections, ...staleSections].flatMap((row) => {
    const blockers = parseStatusJsonArray(row.blockers_json);
    return blockers.length ? blockers.map((item) => ({ section_key: row.section_key, section_label: row.section_label, ...(item as Record<string, unknown>) })) : [{
      section_key: row.section_key,
      section_label: row.section_label,
      status: row.status,
      message: row.status_message ?? "This section is not ready."
    }];
  });

  return {
    status,
    can_activate_candidate: false,
    shadow_only: true,
    passing_sections: passingSections.map(serializeOnboardingSectionStatus),
    blocking_sections: blockingSections.map(serializeOnboardingSectionStatus),
    failed_sections: failedSections.map(serializeOnboardingSectionStatus),
    stale_sections: staleSections.map(serializeOnboardingSectionStatus),
    blockers: blockerRows,
    last_evaluated_at: allRows.map((row) => row.last_evaluated_at ?? row.updated_at).filter(Boolean).sort().at(-1) ?? nowIso()
  };
}

export async function rebuildOnboardingSectionStatusesForCase(db: D1Database, caseId: string, actorUserId?: string | null) {
  await ensureOnboardingSectionStatusesSchema(db);
  const evaluated = await evaluateOnboardingSectionStatuses(db, caseId, actorUserId ?? null);
  for (const status of evaluated.statuses) {
    await upsertOnboardingSectionStatus(db, status);
  }
  const rows = await getOnboardingSectionStatuses(db, caseId);
  const readiness = aggregateOnboardingReadinessFromSections(evaluated.definitions, rows, caseId);
  return {
    request_id: `section_status_rebuild_${crypto.randomUUID()}`,
    rebuilt_count: evaluated.statuses.length,
    failed_count: evaluated.statuses.filter((status) => status.status === "failed").length,
    readiness,
    sections: rows.map(serializeOnboardingSectionStatus)
  };
}

export async function markOnboardingSectionStale(db: D1Database, input: {
  caseId: string;
  employeeId?: string | null;
  sectionKeys: string[];
  updatedByUserId?: string | null;
  message?: string | null;
}) {
  await ensureOnboardingSectionStatusesSchema(db);
  const definitions = await getOnboardingSectionDefinitions(db, input.caseId);
  for (const sectionKey of Array.from(new Set(input.sectionKeys))) {
    const definition = definitions.find((item) => item.section_key === sectionKey) ?? onboardingSectionDefinitionByKey(sectionKey);
    if (!definition) continue;
    if (!definition.default_required && definition.can_be_not_required) {
      await upsertOnboardingSectionStatus(db, {
        case_id: input.caseId,
        employee_id: input.employeeId ?? null,
        section_key: definition.section_key,
        section_label: definition.section_label,
        status: "not_required",
        is_required: false,
        is_complete: true,
        is_verified: false,
        is_stale: false,
        status_reason_code: "SECTION_NOT_REQUIRED",
        status_message: `${definition.section_label} is not required for this onboarding case.`,
        next_action: null,
        missing_fields: [],
        blockers: [],
        field_status: {},
        source_version: "section-status-phase1",
        updated_by_user_id: input.updatedByUserId ?? null
      });
      continue;
    }
    await upsertOnboardingSectionStatus(db, {
      case_id: input.caseId,
      employee_id: input.employeeId ?? null,
      section_key: definition.section_key,
      section_label: definition.section_label,
      status: "stale",
      is_required: definition.default_required,
      is_complete: false,
      is_verified: false,
      is_stale: true,
      status_reason_code: "SECTION_STALE",
      status_message: input.message ?? "This section needs to be rechecked because related setup changed.",
      next_action: "Rebuild section status preview.",
      blockers: [{ type: "SECTION_STALE", message: "This section needs to be rechecked because related setup changed." }],
      field_status: {},
      source_version: "section-status-phase1",
      updated_by_user_id: input.updatedByUserId ?? null
    });
  }
}

export function sanitizeSectionStatusError(error: unknown, sectionKey = "readiness") {
  const definition = onboardingSectionDefinitionByKey(sectionKey);
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const safe = raw
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
    .replace(/\bSELECT\b[\s\S]*/gi, "The section check could not be completed")
    .replace(/stack trace[\s\S]*/gi, "The section check could not be completed")
    .replace(/password|token|secret|document number|account number/gi, "sensitive value")
    .slice(0, 220);
  const label = definition?.section_label ?? sectionKey.replace(/_/g, " ");
  return {
    error_code: "SECTION_STATUS_EVALUATOR_FAILED",
    error_message: `${label} could not be checked safely.`,
    failed_section_key: sectionKey,
    failed_section_label: label,
    next_action: `Review the ${label} setup and rebuild the section status preview.`,
    safe_log_message: safe || "The section check could not be completed."
  };
}
