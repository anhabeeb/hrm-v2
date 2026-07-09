import type { RouteNavItem } from "../components/ui/route-nav-switcher";

export const CONTRACTS_NAV_ITEMS: RouteNavItem[] = [
  { key: "contracts", label: "Contracts", to: "/v3-preview/contracts", end: true },
  { key: "types", label: "Types", to: "/v3-preview/contracts/types" },
  { key: "probation", label: "Probation due", to: "/v3-preview/contracts/probation" },
  { key: "renewals", label: "Renewals", to: "/v3-preview/contracts/renewals" },
  { key: "alerts", label: "Alerts", to: "/v3-preview/contracts/alerts" }
];
