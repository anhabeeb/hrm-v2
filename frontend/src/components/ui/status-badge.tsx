import { Badge } from "./badge";
import type { HTMLAttributes } from "react";

const statusLabels: Record<string, string> = {
  APPROVED_PLACEHOLDER: "Approved",
  BANK_NOTIFICATION_PENDING: "Bank notice pending",
  BANK_NOTIFIED: "Bank notified",
  BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE: "Bank direct collection",
  CALCULATING: "Calculating",
  FINALIZED_PLACEHOLDER: "Finalized",
  MANUALLY_CONFIRMED_PAID: "Manual paid",
  MANUALLY_CONFIRMED_PAID_TO_BANK: "Bank paid",
  PENDING_RELEASE: "Pending release",
  READY_FOR_REVIEW: "Ready for review",
  SKIPPED_MINIMUM_NET_PROTECTION: "Skipped: min net",
  SUBMITTED_FOR_APPROVAL: "Submitted"
};

export function humanizeStatus(value: unknown) {
  const raw = String(value ?? "UNKNOWN");
  const upper = raw.toUpperCase();
  return statusLabels[upper] ?? raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
    "CRITICAL", "ERROR", "FAILED", "FAIL", "BLOCKED", "NOT_READY", "OFFLINE"
  ].includes(text)) return "danger";
  if (["ON_LEAVE", "LEAVE", "PROCESSING", "OPEN", "RETURNED", "ARCHIVED", "INACTIVE", "CALCULATING", "APPLYING"].includes(text)) return "info";
  return "neutral";
}

export function StatusBadge({ value, className }: { value: unknown; className?: HTMLAttributes<HTMLSpanElement>["className"] }) {
  const raw = String(value ?? "UNKNOWN");
  return <Badge tone={statusTone(value)} title={raw} className={className}>{humanizeStatus(value)}</Badge>;
}
