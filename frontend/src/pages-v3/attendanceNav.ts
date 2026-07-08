import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const ATTENDANCE_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "records", label: "Records", to: "/v3-preview/attendance", end: true },
  { key: "calendar", label: "Calendar", to: "/v3-preview/attendance/calendar" },
  { key: "corrections", label: "Corrections", to: "/v3-preview/attendance/corrections" },
  { key: "devices", label: "Devices", to: "/v3-preview/attendance/devices" },
  { key: "reports", label: "Reports", to: "/v3-preview/attendance/reports" },
  { key: "settings", label: "Settings", to: "/v3-preview/attendance/settings" }
];
