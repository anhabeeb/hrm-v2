import type { Context } from "hono";
import type { AppBindings } from "../types";
import {
  getEmployeeSetupSectionPreviewPayload,
  markEmployeeSetupSectionStale,
  sanitizeEmployeeSetupStatusError
} from "./section-status";
import { evaluateEmployeeSetupSections, type EmployeeSetupSectionKey } from "./section-evaluators";

export type EmployeeSetupStatusUpdate = {
  mode: "employee_360_setup";
  updated_sections: unknown[];
  stale_sections: unknown[];
  readiness: {
    status: string;
    can_activate_candidate: false;
    activation_requires_final_verification: true;
    blockers: unknown[];
    [key: string]: unknown;
  };
  warnings: Array<{
    code: string;
    message: string;
    section_key?: string | null;
    section_label?: string | null;
    request_id?: string | null;
  }>;
};

export type EmployeeSetupStatusUpdateOptions = {
  employeeId: string;
  savedSectionKey: EmployeeSetupSectionKey;
  affectedSectionKeys?: EmployeeSetupSectionKey[];
  staleSectionKeys?: EmployeeSetupSectionKey[];
  requestId?: string | null;
};

const NOT_CHECKED_READINESS = {
  status: "not_checked",
  can_activate_candidate: false as const,
  activation_requires_final_verification: true as const,
  blockers: []
};

function requestIdFromContext(c: Context<AppBindings>, explicit?: string | null) {
  return explicit ?? c.req.header("X-Request-ID") ?? c.req.header("x-request-id") ?? crypto.randomUUID();
}

function uniqueKeys(keys: Array<string | null | undefined>) {
  return Array.from(new Set(keys.map((key) => String(key ?? "").trim()).filter(Boolean))) as EmployeeSetupSectionKey[];
}

export async function updateEmployeeSetupSectionStatusAfterSave(
  c: Context<AppBindings>,
  options: EmployeeSetupStatusUpdateOptions
): Promise<EmployeeSetupStatusUpdate> {
  const requestId = requestIdFromContext(c, options.requestId);
  const actorUserId = c.get("currentUser")?.id ?? null;
  const affectedSectionKeys = uniqueKeys([options.savedSectionKey, ...(options.affectedSectionKeys ?? [])]);
  const staleSectionKeys = uniqueKeys(options.staleSectionKeys ?? []).filter((key) => !affectedSectionKeys.includes(key));
  const warnings: EmployeeSetupStatusUpdate["warnings"] = [];
  let updatedSections: unknown[] = [];
  let staleSections: unknown[] = [];
  let readiness: EmployeeSetupStatusUpdate["readiness"] = NOT_CHECKED_READINESS;

  try {
    const evaluated = await evaluateEmployeeSetupSections(c.env.DB, options.employeeId, affectedSectionKeys, actorUserId, {
      persist: true,
      lastSavedAt: new Date().toISOString()
    });
    updatedSections = evaluated.updated_sections;
    readiness = {
      ...evaluated.readiness,
      can_activate_candidate: false,
      activation_requires_final_verification: true
    };
  } catch (error) {
    const safe = sanitizeEmployeeSetupStatusError(error, options.savedSectionKey);
    warnings.push({
      code: safe.error_code,
      message: `${safe.error_message} ${safe.next_action}`,
      section_key: safe.failed_section_key,
      section_label: safe.failed_section_label,
      request_id: requestId
    });
  }

  if (staleSectionKeys.length) {
    try {
      await markEmployeeSetupSectionStale(c.env.DB, {
        employeeId: options.employeeId,
        sectionKeys: staleSectionKeys,
        updatedByUserId: actorUserId,
        message: "This section needs to be rechecked because related setup changed."
      });
      const preview = await getEmployeeSetupSectionPreviewPayload(c.env.DB, options.employeeId);
      const staleKeySet = new Set<string>(staleSectionKeys);
      staleSections = preview.sections.filter((section) => staleKeySet.has(String((section as { section_key?: string }).section_key)));
      readiness = {
        ...preview.readiness,
        can_activate_candidate: false,
        activation_requires_final_verification: true
      };
    } catch (error) {
      const safe = sanitizeEmployeeSetupStatusError(error, "readiness");
      warnings.push({
        code: safe.error_code,
        message: `${safe.error_message} ${safe.next_action}`,
        section_key: null,
        section_label: "Employee 360 setup readiness",
        request_id: requestId
      });
    }
  }

  return {
    mode: "employee_360_setup",
    updated_sections: updatedSections,
    stale_sections: staleSections,
    readiness,
    warnings
  };
}

export function employeeSetupStatusUpdateResponse<T extends Record<string, unknown>>(
  payload: T,
  setupStatusUpdate: EmployeeSetupStatusUpdate
) {
  return {
    ...payload,
    setup_status_update: setupStatusUpdate
  };
}
