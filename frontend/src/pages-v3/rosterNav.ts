import type { RouteNavItem } from "../components/ui/route-nav-switcher";

export const ROSTER_NAV_ITEMS: RouteNavItem[] = [
  { key: "weekly", label: "Weekly roster", to: "/v3-preview/roster", end: true },
  { key: "shift-templates", label: "Shift templates", to: "/v3-preview/roster/shift-templates" },
  { key: "reports", label: "Reports", to: "/v3-preview/roster/reports" },
  { key: "settings", label: "Settings", to: "/v3-preview/roster/settings" }
];
