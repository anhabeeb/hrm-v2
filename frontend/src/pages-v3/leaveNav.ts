import type { RouteNavItem } from "../components/ui/route-nav-switcher";

export const LEAVE_NAV_ITEMS: RouteNavItem[] = [
  { key: "requests", label: "Requests", to: "/v3-preview/leave/requests" },
  { key: "approvals", label: "Approvals", to: "/v3-preview/leave/approvals" },
  { key: "calendar", label: "Calendar", to: "/v3-preview/leave/calendar" },
  { key: "balances", label: "Balances", to: "/v3-preview/leave/balances" },
  { key: "types-policies", label: "Types & policies", to: "/v3-preview/leave/types-policies" },
  { key: "workflows", label: "Workflows", to: "/v3-preview/leave/workflows" },
  { key: "document-rules", label: "Document rules", to: "/v3-preview/leave/document-rules" },
  { key: "deduction-rules", label: "Deduction rules", to: "/v3-preview/leave/deduction-rules" }
];
