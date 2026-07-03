const explicitDisplayLabels: Record<string, string> = {
  ACTIVE: "Active",
  ACTIVE_EMPLOYEE_ONLY: "Active employee only",
  APPROVED: "Approved",
  APPROVED_PLACEHOLDER: "Approved",
  ARCHIVED: "Archived",
  ASSETS_UNIFORMS: "Assets & uniforms",
  BANK_NOTIFICATION_PENDING: "Bank notice pending",
  BANK_NOTIFIED: "Bank notified",
  BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE: "Bank direct collection",
  BLOCKED: "Blocked",
  CALCULATING: "Calculating",
  CANCELLED: "Cancelled",
  CASH: "Cash",
  COMPLETE: "Complete",
  COMPLETED: "Completed",
  CONTRACT_COMPLIANCE: "Contract compliance",
  CRITICAL: "Critical",
  DASHBOARD: "Dashboard",
  DISABLED: "Disabled",
  DOCUMENT_COMPLIANCE: "Document compliance",
  DRAFT: "Draft",
  ERROR: "Error",
  EXPIRED: "Expired",
  EXPIRING_SOON: "Expiring soon",
  FAILED: "Failed",
  FINAL_SETTLEMENT: "Final settlement",
  FINALIZED: "Finalized",
  FINALIZED_PLACEHOLDER: "Finalized",
  FULL_TIME: "Full time",
  IN_PROGRESS: "In progress",
  INACTIVE: "Inactive",
  LOCKED: "Locked",
  MANUALLY_CONFIRMED_PAID: "Manual paid",
  MANUALLY_CONFIRMED_PAID_TO_BANK: "Bank paid",
  MODULE_DISABLED: "Module disabled",
  NEEDS_REVIEW: "Needs review",
  NOT_APPLICABLE: "Not applicable",
  NOT_REQUIRED: "Not required",
  OVERDUE: "Overdue",
  PART_TIME: "Part time",
  PAYMENT_INSTITUTIONS: "Payment institutions",
  PAYMENT_METHODS: "Payment methods",
  PENDING: "Pending",
  PENDING_APPROVAL: "Pending approval",
  PENDING_RELEASE: "Pending release",
  READY_FOR_APPROVAL: "Ready for approval",
  READY_FOR_REVIEW: "Ready for review",
  REJECTED: "Rejected",
  SELF_SERVICE: "Self-service",
  SENT_BACK: "Sent back",
  SKIPPED_MINIMUM_NET_PROTECTION: "Skipped: min net",
  SUBMITTED_FOR_APPROVAL: "Submitted",
  SUPER_ADMIN: "Super Admin",
  TEAM_MEMBER: "Team Member",
  TEMPORARY: "Temporary",
  WARNING: "Warning",
  WORK_PERMIT: "Work permit"
};

function normalizeKey(value: string) {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function titleCaseWords(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part === "id") return "ID";
      if (part === "hr") return "HR";
      if (part === "r2") return "R2";
      if (part === "d1") return "D1";
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

export function humanizeTechnicalLabel(value: unknown, fallback = "Not set") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const explicit = explicitDisplayLabels[normalizeKey(raw)];
  return explicit ?? titleCaseWords(raw);
}

export function formatStatusLabel(value: unknown) {
  return humanizeTechnicalLabel(value, "Unknown");
}

export function formatModuleLabel(value: unknown) {
  return humanizeTechnicalLabel(value, "Module");
}

export function formatPaymentMethodLabel(value: unknown) {
  return humanizeTechnicalLabel(value, "Payment method");
}

export function formatRoleLabel(value: unknown) {
  return humanizeTechnicalLabel(value, "Team Member");
}

export function safeDisplayValue(value: unknown, fallback = "Not set") {
  return humanizeTechnicalLabel(value, fallback);
}

export const phase14DisplayLabelExamples = explicitDisplayLabels;
