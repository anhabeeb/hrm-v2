import type { QueryClient } from "@tanstack/react-query";
import type { AppEvent } from "./appEventsApi";
import { queryKeys, type QueryScope } from "./queryKeys";
import {
  invalidateCommandCenterSummary,
  invalidateEmployeeProfileSlices,
  invalidateNotificationQueries,
  invalidateOnboardingWorkspaceSlices
} from "./workspaceInvalidation";
import { recordCacheEvent } from "./performance";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payloadEmployeeId(event: AppEvent) {
  return text(event.payload?.employee_id) ?? (event.entity_type === "employee" ? text(event.entity_id) : null);
}

function payloadCaseId(event: AppEvent) {
  return text(event.payload?.onboarding_case_id) ?? (event.entity_type === "onboarding_case" ? text(event.entity_id) : null);
}

function invalidateFamily(client: QueryClient, scope: QueryScope, family: string, event: AppEvent) {
  const caseId = payloadCaseId(event);
  const employeeId = payloadEmployeeId(event);

  if (family === "notifications" || family === "notifications.unread") {
    invalidateNotificationQueries(scope, client);
    return 2;
  }

  if ((family === "onboarding.workspace" || family === "onboarding.readiness") && caseId) {
    invalidateOnboardingWorkspaceSlices({
      scope,
      caseId,
      slices: ["documents", "document-checklist", "employee-document-summary", "readiness", "payment-methods", "job-assignment", "employee-info"],
      client
    });
    void client.invalidateQueries({ queryKey: queryKeys.onboarding.workspace(scope, caseId) });
    return 2;
  }

  if ((family === "documents" || family === "document-checklist" || family === "employee-document-summary") && employeeId) {
    invalidateEmployeeProfileSlices({ scope, employeeId, slices: ["documents", "document-checklist", "employee-document-summary"], client });
    return 1;
  }

  if ((family === "employees" || family === "employee.profile") && employeeId) {
    invalidateEmployeeProfileSlices({ scope, employeeId, slices: ["profile", "summary", "job-assignment", "contacts"], client });
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), "employees"] });
    return 2;
  }

  if (family === "dashboard.command-center") {
    invalidateCommandCenterSummary(scope, client);
    return 1;
  }

  if (family === "background-jobs") {
    void client.invalidateQueries({ queryKey: queryKeys.backgroundJobs.list(scope, 10) });
    if (event.entity_type === "background_job" && event.entity_id) void client.invalidateQueries({ queryKey: queryKeys.backgroundJobs.detail(scope, event.entity_id) });
    return 2;
  }

  if (family === "module-visibility" || family === "auth.me") {
    void client.invalidateQueries({ queryKey: queryKeys.moduleVisibility(scope) });
    void client.invalidateQueries({ queryKey: queryKeys.auth.currentUser(scope) });
    invalidateCommandCenterSummary(scope, client);
    return 3;
  }

  if (family === "reports" || family === "report-artifacts") {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), "reports"] });
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), "report-artifacts"] });
    return 2;
  }

  if (family === "data_import" || family === "data_export") {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), family] });
    return 1;
  }

  if (["attendance", "payroll", "leave", "roster", "contracts", "assets_uniforms", "search"].includes(family)) {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), family] });
    return 1;
  }

  return 0;
}

export function routeAppEventInvalidation(input: { event: AppEvent; scope: QueryScope; client: QueryClient; source: "poll" | "cross-tab" }) {
  const families = new Set<string>(Array.isArray(input.event.query_keys) ? input.event.query_keys : []);
  if (!families.size) {
    families.add(input.event.module_key);
    if (input.event.event_type.startsWith("notification.")) families.add("notifications");
    if (input.event.event_type.startsWith("background_job.")) families.add("background-jobs");
  }

  let invalidationCount = 0;
  for (const family of families) {
    invalidationCount += invalidateFamily(input.client, input.scope, family, input.event);
  }

  recordCacheEvent({
    key: ["app-event", input.event.event_type, input.event.id],
    disposition: "background-refresh",
    source: `live:${input.source}:invalidations:${invalidationCount}`
  });

  return invalidationCount;
}

export function backgroundJobFromAppEvent(event: AppEvent) {
  if (!event.event_type.startsWith("background_job.")) return null;
  const payload = event.payload ?? {};
  return {
    id: text(payload.job_id) ?? event.entity_id ?? event.id,
    job_type: text(payload.job_type) ?? "BACKGROUND_JOB",
    status: text(payload.status) ?? "RUNNING",
    module_key: text(payload.module_key),
    entity_type: text(payload.entity_type),
    entity_id: text(payload.entity_id)
  };
}
