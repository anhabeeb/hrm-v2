import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const DOCUMENTS_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "registry", label: "Registry", to: "/v3-preview/documents/registry" },
  { key: "compliance", label: "Compliance", to: "/v3-preview/documents/compliance" },
  { key: "missing", label: "Missing documents", to: "/v3-preview/documents/missing" }
];
