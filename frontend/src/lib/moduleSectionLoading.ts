export type ModuleSectionStatus =
  | "COMPLETE"
  | "MISSING"
  | "NOT_REQUIRED"
  | "DISABLED"
  | "NO_PERMISSION"
  | "WARNING"
  | "TIMEOUT"
  | "DEFERRED";

export type ModuleSectionState = {
  status?: ModuleSectionStatus | string;
  label?: string;
  message?: string;
  retry_key?: string;
  refreshing?: boolean;
};

export function isNonBlockingSectionStatus(status: unknown) {
  return ["DISABLED", "NO_PERMISSION", "WARNING", "TIMEOUT", "DEFERRED", "NOT_REQUIRED"].includes(String(status ?? "").toUpperCase());
}

export function sectionNeedsRetry(state: ModuleSectionState | null | undefined) {
  return ["WARNING", "TIMEOUT", "DEFERRED"].includes(String(state?.status ?? "").toUpperCase());
}

export function sectionStatusLabel(state: ModuleSectionState | null | undefined) {
  const status = String(state?.status ?? "").toUpperCase();
  if (status === "NO_PERMISSION") return "No permission";
  if (status === "NOT_REQUIRED") return "Not required";
  if (status === "DEFERRED") return "Refreshing";
  if (status === "TIMEOUT") return "Timed out";
  return status ? status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable";
}
