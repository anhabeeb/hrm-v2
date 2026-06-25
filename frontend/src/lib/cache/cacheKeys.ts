export const CACHE_SCHEMA_VERSION = 1;
export const APP_CACHE_VERSION = "post-production-cache-timeout-v1";

export const HRM_CACHE_DB_NAME = "hrm-v2-cache";
export const HRM_CACHE_STORE = "cache_entries";
export const HRM_CACHE_METADATA_STORE = "cache_metadata";

export const SAFE_CACHE_MODULES = [
  "navigation",
  "reference_data",
  "dashboard",
  "employees",
  "employee_360",
  "attendance",
  "roster",
  "leave",
  "self_service",
  "reports",
  "ui_preferences",
  "drafts"
] as const;

export const SENSITIVE_CACHE_MODULES = [
  "payroll",
  "payslips",
  "bank_loans",
  "pension",
  "payment_methods",
  "final_settlement",
  "documents",
  "document_compliance",
  "approvals",
  "audit",
  "security",
  "admin_settings",
  "reports_sensitive",
  "imports"
] as const;

export type HrmCacheModule = (typeof SAFE_CACHE_MODULES)[number] | (typeof SENSITIVE_CACHE_MODULES)[number] | string;

export function userScopedCacheKey(input: { userId: string; moduleKey: HrmCacheModule; entityType?: string; entityId?: string; suffix?: string }) {
  return [
    input.userId,
    input.moduleKey,
    input.entityType ?? "module",
    input.entityId ?? "all",
    input.suffix ?? "default"
  ].join(":");
}

export function employee360CacheKey(userId: string, employeeId: string) {
  return userScopedCacheKey({ userId, moduleKey: "employee_360", entityType: "employee", entityId: employeeId });
}

export function moduleCacheKey(userId: string, moduleKey: HrmCacheModule) {
  return userScopedCacheKey({ userId, moduleKey });
}
