import { Badge } from "./badge";

function normalize(value: unknown) {
  return String(value ?? "UNKNOWN").replace(/_/g, " ");
}

export function statusTone(value: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const text = String(value ?? "").toUpperCase();
  if (["ACTIVE", "APPROVED", "PAID", "PRESENT", "VALID", "ISSUED", "SCHEDULED", "PUBLISHED", "COMPLETED"].includes(text)) return "success";
  if (["PENDING", "SUBMITTED", "PENDING_APPROVAL", "REQUESTED", "DRAFT", "REVIEW", "EXPIRING_SOON", "LATE", "HELD"].includes(text)) return "warning";
  if (["DISABLED", "LOCKED", "REJECTED", "CANCELLED", "EXPIRED", "ABSENT", "LOST", "DAMAGED", "SOFT_DELETED"].includes(text)) return "danger";
  if (["ON_LEAVE", "LEAVE", "PROCESSING", "OPEN", "RETURNED", "ARCHIVED"].includes(text)) return "info";
  return "neutral";
}

export function StatusBadge({ value }: { value: unknown }) {
  return <Badge tone={statusTone(value)}>{normalize(value)}</Badge>;
}
