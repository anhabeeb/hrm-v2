import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const CONTRACTS_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "contracts", label: "Contracts", to: "/v3-preview/contracts", end: true },
  { key: "types", label: "Types", to: "/v3-preview/contracts/types" },
  { key: "probation", label: "Probation due", to: "/v3-preview/contracts/probation" },
  { key: "renewals", label: "Renewals", to: "/v3-preview/contracts/renewals" },
  { key: "alerts", label: "Alerts", to: "/v3-preview/contracts/alerts" }
];
