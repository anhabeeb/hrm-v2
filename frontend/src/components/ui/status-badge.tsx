import { Badge } from "./badge";

function normalize(value: unknown) {
  return String(value ?? "UNKNOWN").replace(/_/g, " ");
}

export function statusTone(value: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const text = String(value ?? "").toUpperCase();
  if (["ACTIVE", "APPROVED", "PAID", "PRESENT", "VALID", "ISSUED", "SCHEDULED", "PUBLISHED", "COMPLETED", "FINALIZED", "FINALIZED_PLACEHOLDER", "READY", "READY_TO_APPLY", "READY_FOR_REVIEW", "CLEARED", "SUCCESS", "PASS", "APPLIED"].includes(text)) return "success";
  if (["PENDING", "SUBMITTED", "PENDING_APPROVAL", "REQUESTED", "DRAFT", "REVIEW", "READY_FOR_REVIEW", "EXPIRING_SOON", "LATE", "HELD", "WARNING", "OVERDUE", "SENT_BACK", "WAIVED", "NOT_TESTED", "PLANNED", "BANK_NOTIFICATION_PENDING"].includes(text)) return "warning";
  if (["DISABLED", "LOCKED", "REJECTED", "CANCELLED", "EXPIRED", "ABSENT", "LOST", "DAMAGED", "SOFT_DELETED", "CRITICAL", "ERROR", "FAILED", "FAIL", "BLOCKED", "NOT_READY"].includes(text)) return "danger";
  if (["ON_LEAVE", "LEAVE", "PROCESSING", "OPEN", "RETURNED", "ARCHIVED", "INACTIVE", "CALCULATING", "APPLYING"].includes(text)) return "info";
  return "neutral";
}

export function StatusBadge({ value }: { value: unknown }) {
  return <Badge tone={statusTone(value)}>{normalize(value)}</Badge>;
}
