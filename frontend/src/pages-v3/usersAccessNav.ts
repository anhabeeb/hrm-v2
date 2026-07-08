import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const USERS_ACCESS_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "users", label: "Users", to: "/v3-preview/users-access/users" },
  { key: "roles", label: "Roles", to: "/v3-preview/users-access/roles" },
  { key: "permissions", label: "Permissions", to: "/v3-preview/users-access/permissions" },
  { key: "role_mappings", label: "Role mappings", to: "/v3-preview/users-access/role-mappings" },
  { key: "access_scopes", label: "Access scopes", to: "/v3-preview/users-access/access-scopes" }
];
