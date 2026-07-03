import { Badge } from "./badge";
import type { HTMLAttributes } from "react";
import { formatStatusLabel } from "../../lib/displayLabels";

export function humanizeStatus(value: unknown) {
  return formatStatusLabel(value);
}

export function statusTone(value: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const text = String(value ?? "").toUpperCase();
  if ([
    "ACTIVE", "APPROVED", "PAID", "PRESENT", "VALID", "ISSUED", "SCHEDULED", "PUBLISHED", "COMPLETED", "FINALIZED",
    "FINALIZED_PLACEHOLDER", "READY", "READY_TO_APPLY", "READY_FOR_REVIEW", "CLEARED", "SUCCESS", "PASS", "APPLIED",
    "SYNCED", "IMPORTED", "PROCESSED"
  ].includes(text)) return "success";
  if ([
    "PENDING", "SUBMITTED", "PENDING_APPROVAL", "REQUESTED", "DRAFT", "REVIEW", "EXPIRING_SOON", "LATE", "HELD",
    "WARNING", "OVERDUE", "SENT_BACK", "WAIVED", "NOT_TESTED", "PLANNED", "BANK_NOTIFICATION_PENDING", "PARTIAL"
  ].includes(text)) return "warning";
  if ([
    "DISABLED", "LOCKED", "REJECTED", "CANCELLED", "EXPIRED", "ABSENT", "LOST", "DAMAGED", "SOFT_DELETED",
    "CRITICAL", "ERROR", "FAILED", "DEAD_LETTERED", "FAIL", "BLOCKED", "NOT_READY", "OFFLINE"
  ].includes(text)) return "danger";
  if (["ON_LEAVE", "LEAVE", "PROCESSING", "OPEN", "RETURNED", "ARCHIVED", "INACTIVE", "CALCULATING", "APPLYING"].includes(text)) return "info";
  return "neutral";
}

export function StatusBadge({ value, className }: { value: unknown; className?: HTMLAttributes<HTMLSpanElement>["className"] }) {
  const raw = String(value ?? "UNKNOWN");
  return <Badge tone={statusTone(value)} title={raw} className={className}>{humanizeStatus(value)}</Badge>;
}
