import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const APPROVALS_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "inbox", label: "My pending", to: "/v3-preview/approvals", end: true },
  { key: "submitted", label: "Submitted", to: "/v3-preview/approvals/submitted" },
  { key: "overdue", label: "Overdue", to: "/v3-preview/approvals/overdue" },
  { key: "escalated", label: "Escalated", to: "/v3-preview/approvals/escalated" },
  { key: "delegated", label: "Delegated", to: "/v3-preview/approvals/delegated" },
  { key: "history", label: "History", to: "/v3-preview/approvals/history" },
  { key: "workflows", label: "Workflows", to: "/v3-preview/approvals/workflows" },
  { key: "delegations", label: "Delegations", to: "/v3-preview/approvals/delegations" },
  { key: "templates", label: "Templates", to: "/v3-preview/approvals/templates" },
  { key: "reports", label: "Reports", to: "/v3-preview/approvals/reports" }
];
