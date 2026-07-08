import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const ROSTER_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "weekly", label: "Weekly roster", to: "/v3-preview/roster", end: true },
  { key: "shift-templates", label: "Shift templates", to: "/v3-preview/roster/shift-templates" },
  { key: "reports", label: "Reports", to: "/v3-preview/roster/reports" },
  { key: "settings", label: "Settings", to: "/v3-preview/roster/settings" }
];
