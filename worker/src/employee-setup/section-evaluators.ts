import {
  aggregateEmployeeSetupReadiness,
  composeEmployeeSetupSectionStatusRows,
  createEmployeeSetupEvaluationContext,
  ensureEmployeeSetupSectionStatusesSchema,
  getEmployeeSetupSectionStatuses,
  safeEvaluateEmployeeSetupSection,
  serializeEmployeeSetupSectionStatus,
  upsertEmployeeSetupSectionStatus,
  type EmployeeSetupSectionStatusInput
} from "./section-status";

export type EmployeeSetupSectionKey =
  | "profile_information"
  | "contact_emergency"
  | "job_assignment"
  | "documents"
  | "contract"
  | "payroll_profile"
  | "payment_method"
  | "pension"
  | "user_access"
  | "attendance_roster"
  | "assets_uniforms"
  | "approval_tasks"
  | "final_verification";

export type EmployeeSetupSectionEvaluationResult = {
  section_key: string;
  section_label: string;
  status: string;
  is_required: boolean;
  is_complete: boolean;
  is_verified: boolean;
  is_stale: boolean;
  missing_fields: unknown[];
  blockers: unknown[];
  field_status: Record<string, unknown>;
  status_reason_code: string | null;
  status_message: string | null;
  next_action: string | null;
  last_saved_at: string | null;
  last_evaluated_at: string | null;
  updated_at: string;
};

function uniqueSectionKeys(sectionKeys: string[]) {
  return Array.from(new Set(sectionKeys.map((key) => String(key ?? "").trim()).filter(Boolean)));
}

export async function evaluateEmployeeSetupSections(
  db: D1Database,
  employeeId: string,
  sectionKeys: string[],
  actorUserId?: string | null,
  options?: { persist?: boolean; lastSavedAt?: string | null }
) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const keys = uniqueSectionKeys(sectionKeys);
  const { definitions, context } = await createEmployeeSetupEvaluationContext(db, employeeId, actorUserId ?? null);
  const definitionsByKey = new Map(definitions.map((definition) => [definition.section_key, definition]));
  const evaluated: EmployeeSetupSectionStatusInput[] = [];
  const now = options?.lastSavedAt ?? new Date().toISOString();

  for (const sectionKey of keys) {
    const definition = definitionsByKey.get(sectionKey);
    if (!definition) continue;
    const status = await safeEvaluateEmployeeSetupSection(definition, context);
    status.last_saved_at = now;
    status.source_version = "employee360-setup-phase2";
    evaluated.push(status);
  }

  if (options?.persist !== false) {
    for (const status of evaluated) {
      await upsertEmployeeSetupSectionStatus(db, status);
    }
  }

  const storedRows = await getEmployeeSetupSectionStatuses(db, employeeId);
  const previewRows = composeEmployeeSetupSectionStatusRows(definitions, storedRows, employeeId);
  const updatedKeySet = new Set(evaluated.map((status) => status.section_key));
  return {
    mode: "employee_360_setup",
    updated_sections: previewRows
      .filter((row) => updatedKeySet.has(row.section_key))
      .map(serializeEmployeeSetupSectionStatus) as EmployeeSetupSectionEvaluationResult[],
    readiness: aggregateEmployeeSetupReadiness(definitions, previewRows, employeeId),
    sections: previewRows.map(serializeEmployeeSetupSectionStatus),
    evaluated_count: evaluated.length
  };
}
