import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const DOCUMENTS_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "registry", label: "Registry", to: "/v3-preview/documents/registry" },
  { key: "compliance", label: "Compliance", to: "/v3-preview/documents/compliance", end: true },
  { key: "compliance-missing", label: "Missing", to: "/v3-preview/documents/compliance/missing" },
  { key: "compliance-expiring", label: "Expiring", to: "/v3-preview/documents/compliance/expiring" },
  { key: "compliance-expired", label: "Expired", to: "/v3-preview/documents/compliance/expired" },
  { key: "compliance-alerts", label: "Alerts", to: "/v3-preview/documents/compliance/alerts" },
  { key: "compliance-renewal-cases", label: "Renewal cases", to: "/v3-preview/documents/compliance/renewal-cases" },
  { key: "compliance-waivers", label: "Waivers", to: "/v3-preview/documents/compliance/waivers" },
  { key: "missing", label: "Missing documents", to: "/v3-preview/documents/missing" }
];
