import type { RouteNavItem } from "../components/ui/route-nav-switcher";

export const ASSETS_NAV_ITEMS: RouteNavItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/v3-preview/assets", end: true },
  { key: "items", label: "Items", to: "/v3-preview/assets/items" },
  { key: "assignments", label: "Assignments", to: "/v3-preview/assets/assignments" },
  { key: "uniform-types", label: "Uniform types", to: "/v3-preview/assets/uniform-types" },
  { key: "uniforms", label: "Uniform inventory", to: "/v3-preview/assets/uniforms" },
  { key: "uniform-assignments", label: "Uniform assignments", to: "/v3-preview/assets/uniform-assignments" },
  { key: "categories", label: "Categories", to: "/v3-preview/assets/categories" },
  { key: "deduction-rules", label: "Deduction rules", to: "/v3-preview/assets/deduction-rules" },
  { key: "settings", label: "Settings", to: "/v3-preview/assets/settings" },
  { key: "reports", label: "Reports", to: "/v3-preview/assets/reports" }
];
