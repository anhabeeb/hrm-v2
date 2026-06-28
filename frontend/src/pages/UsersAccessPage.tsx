import {
  CheckCircle2,
  Edit,
  Eye,
  KeyRound,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  UserCog,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { FormBlockingAlert } from "../components/forms/FormBlockingAlert";
import { FormWarningAlert } from "../components/forms/FormWarningAlert";
import { ValidationSummary } from "../components/forms/ValidationSummary";
import { FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput } from "../components/filters";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckboxField, PageHeader, PageShell, SelectField as UiSelectField, StandardTabs } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import type { ValidationIssue } from "../lib/validation";
import type { AccessScopeRule, AccessScopeType, AccessUser, Permission, Role, RoleMappingRule, UserStatus } from "../types/auth";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";

type Tab = "users" | "roles" | "permissions" | "role_mappings" | "access_scopes";
type UserModalMode = "create" | "edit" | "assign";
type RoleModalMode = "create" | "edit" | "permissions" | "view";
type ScopeModalMode = "create" | "edit";
type MappingModalMode = "create" | "edit";

const MODULE_LABELS: Record<string, string> = {
  access_scopes: "Access Scopes",
  role_mappings: "Role Mapping",
  dashboard: "Dashboard",
  users: "Users",
  roles: "Roles",
  employees: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  roster: "Roster",
  documents: "Documents",
  assets: "Assets",
  uniforms: "Uniforms",
  reports: "Reports",
  settings: "Settings",
  self_service: "Self-Service",
  audit: "Audit",
  admin: "Admin Controls",
  data_import: "Data Import",
  data_export: "Data Export",
  data_transfer: "Data Transfer",
  backup: "Backup Readiness",
  migration: "Migration Readiness",
  deployment: "Deployment Readiness",
  qa: "QA & Smoke Tests"
};

const SCOPE_TYPE_LABELS: Record<AccessScopeType, string> = {
  SELF_ONLY: "Self only",
  OWN_TEAM: "Own team",
  OWN_DEPARTMENT: "Own department",
  SELECTED_DEPARTMENTS: "Selected departments",
  OWN_LOCATION: "Own location",
  SELECTED_LOCATIONS: "Selected locations",
  ALL_LOCATIONS: "All locations",
  WHOLE_COMPANY: "Whole company"
};

const ACCESS_SCOPE_MODULES = ["employees", "documents", "leave", "attendance", "payroll", "roster", "assets", "reports", "dashboard", "self_service"];

function statusTone(status: UserStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "LOCKED") return "warning" as const;
  return "danger" as const;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function compactDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function includesText(...values: Array<string | null | undefined>) {
  return (query: string) => values.some((value) => value?.toLowerCase().includes(query.toLowerCase()));
}

export function UsersAccessPage() {
  const { token, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleMappings, setRoleMappings] = useState<RoleMappingRule[]>([]);
  const [accessScopes, setAccessScopes] = useState<AccessScopeRule[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("ALL");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");
  const [roleQuery, setRoleQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [permissionModuleFilter, setPermissionModuleFilter] = useState("ALL");
  const [permissionCriticalFilter, setPermissionCriticalFilter] = useState("ALL");
  const [mappingQuery, setMappingQuery] = useState("");
  const [scopeQuery, setScopeQuery] = useState("");
  const [scopeModuleFilter, setScopeModuleFilter] = useState("ALL");
  const [scopeOwnerFilter, setScopeOwnerFilter] = useState("ALL");

  const [userModal, setUserModal] = useState<{ mode: UserModalMode; user?: AccessUser } | null>(null);
  const [roleModal, setRoleModal] = useState<{ mode: RoleModalMode; role?: Role } | null>(null);
  const [mappingModal, setMappingModal] = useState<{ mode: MappingModalMode; mapping?: RoleMappingRule } | null>(null);
  const [scopeModal, setScopeModal] = useState<{ mode: ScopeModalMode; scope?: AccessScopeRule } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; confirmLabel: string; tone?: "default" | "danger"; run: () => Promise<unknown>; success: string } | null>(null);
  const canViewMappings = Boolean(currentUser?.permissions.includes("role_mappings.view"));
  const canManageMappings = Boolean(currentUser?.permissions.includes("role_mappings.manage"));
  const canViewScopes = Boolean(currentUser?.permissions.includes("access_scopes.view"));
  const canManageScopes = Boolean(currentUser?.permissions.includes("access_scopes.manage"));

  async function loadAccessData() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const needsOrgRefs = canViewScopes || canViewMappings;
      const [userResult, roleResult, permissionResult, mappingResult, scopeResult, departmentResult, locationResult, positionResult, jobLevelResult] = await Promise.all([
        api.listUsers(token),
        api.listRoles(token),
        api.listPermissions(token),
        canViewMappings ? api.listRoleMappings(token) : Promise.resolve({ role_mappings: [] }),
        canViewScopes ? api.listAccessScopes(token) : Promise.resolve({ access_scopes: [] }),
        needsOrgRefs ? api.listDepartments(token) : Promise.resolve({ departments: [] }),
        needsOrgRefs ? api.listLocations(token) : Promise.resolve({ locations: [] }),
        needsOrgRefs ? api.listPositions(token) : Promise.resolve({ positions: [] }),
        needsOrgRefs ? api.listJobLevels(token) : Promise.resolve({ job_levels: [] })
      ]);
      setUsers(userResult.users);
      setRoles(roleResult.roles);
      setPermissions(permissionResult.permissions);
      setRoleMappings(mappingResult.role_mappings);
      setAccessScopes(scopeResult.access_scopes);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
      setPositions(positionResult.positions);
      setJobLevels(jobLevelResult.job_levels);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Users & Access could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccessData();
  }, [token, canViewScopes, canViewMappings]);

  const activeOwnerCount = users.filter((accessUser) => accessUser.is_owner && accessUser.status === "ACTIVE").length;
  const ownerRole = roles.find((role) => role.is_owner_role);

  const filteredUsers = useMemo(() => {
    return users.filter((accessUser) => {
      const matchesQuery = !userQuery || includesText(accessUser.name, accessUser.email, accessUser.username)(userQuery);
      const matchesStatus = userStatusFilter === "ALL" || accessUser.status === userStatusFilter;
      const matchesRole = userRoleFilter === "ALL" || accessUser.role_ids.includes(userRoleFilter);
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [users, userQuery, userStatusFilter, userRoleFilter]);

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => !roleQuery || includesText(role.name, role.description)(roleQuery));
  }, [roles, roleQuery]);

  const filteredPermissions = useMemo(() => {
    return permissions.filter((permission) => {
      const matchesQuery = !permissionQuery || includesText(permission.key, permission.description)(permissionQuery);
      const matchesModule = permissionModuleFilter === "ALL" || permission.module === permissionModuleFilter;
      const matchesCritical =
        permissionCriticalFilter === "ALL" ||
        (permissionCriticalFilter === "CRITICAL" ? permission.is_critical : !permission.is_critical);
      return matchesQuery && matchesModule && matchesCritical;
    });
  }, [permissions, permissionQuery, permissionModuleFilter, permissionCriticalFilter]);

  const filteredRoleMappings = useMemo(() => {
    return roleMappings.filter((mapping) => {
      return !mappingQuery || includesText(
        mapping.name,
        mapping.description,
        mapping.role_name,
        mapping.employee_type,
        mapping.employment_type,
        mapping.department_name,
        mapping.position_title,
        mapping.location_name,
        mapping.job_level_name,
        mapping.default_scope_type
      )(mappingQuery);
    });
  }, [roleMappings, mappingQuery]);

  const filteredAccessScopes = useMemo(() => {
    return accessScopes.filter((scope) => {
      const ownerLabel = scope.scope_owner_type === "ROLE"
        ? scope.role_name
        : scope.scope_owner_type === "USER"
          ? `${scope.user_name ?? ""} ${scope.user_email ?? ""}`
          : `${scope.role_mapping_name ?? ""} ${scope.role_mapping_role_name ?? ""}`;
      const matchesQuery = !scopeQuery || includesText(scope.name, scope.description, ownerLabel, scope.scope_type)(scopeQuery);
      const matchesModule = scopeModuleFilter === "ALL" || (scope.module_key ?? "ALL_MODULES") === scopeModuleFilter;
      const matchesOwner = scopeOwnerFilter === "ALL" || scope.scope_owner_type === scopeOwnerFilter;
      return matchesQuery && matchesModule && matchesOwner;
    });
  }, [accessScopes, scopeQuery, scopeModuleFilter, scopeOwnerFilter]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!token) return;
    setNotice("");
    setError("");
    try {
      await action();
      setNotice(successMessage);
      await loadAccessData();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Action could not be completed.");
    }
  }

  function protectedOwnerMessage(accessUser: AccessUser) {
    if (accessUser.is_owner && accessUser.status === "ACTIVE" && activeOwnerCount <= 1) {
      return "Last active Owner is protected";
    }
    return "";
  }

  return (
    <PageShell>
      <PageHeader
        title="Users & Access"
        description="Manage system users, role templates, and predefined permissions."
        actions={
          <>
          <Button variant="outline" size="sm" onClick={() => void loadAccessData()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {activeTab === "users" ? (
            <Button size="sm" onClick={() => setUserModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              User
            </Button>
          ) : null}
          {activeTab === "roles" ? (
            <Button size="sm" onClick={() => setRoleModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Role
            </Button>
          ) : null}
          {activeTab === "role_mappings" && canManageMappings ? (
            <Button size="sm" onClick={() => setMappingModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Mapping
            </Button>
          ) : null}
          {activeTab === "access_scopes" && canManageScopes ? (
            <Button size="sm" onClick={() => setScopeModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Scope
            </Button>
          ) : null}
          </>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <StandardTabs
        items={(["users", "roles", "permissions", ...(canViewMappings ? ["role_mappings" as const] : []), ...(canViewScopes ? ["access_scopes" as const] : [])] as Tab[]).map((tab) => ({ key: tab, label: MODULE_LABELS[tab] ?? tab }))}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
        label="Users and access section tabs"
      />

      <Panel className="overflow-hidden">

        {activeTab === "users" ? (
          <UsersTable
            users={filteredUsers}
            roles={roles}
            loading={loading}
            query={userQuery}
            statusFilter={userStatusFilter}
            roleFilter={userRoleFilter}
            activeOwnerCount={activeOwnerCount}
            onQueryChange={setUserQuery}
            onStatusFilterChange={setUserStatusFilter}
            onRoleFilterChange={setUserRoleFilter}
            onView={(accessUser) => setUserModal({ mode: "edit", user: accessUser })}
            onEdit={(accessUser) => setUserModal({ mode: "edit", user: accessUser })}
            onAssign={(accessUser) => setUserModal({ mode: "assign", user: accessUser })}
            onReset={(accessUser) => {
              setConfirmAction({ title: "Reset password placeholder", description: `Trigger password reset placeholder for ${accessUser.name}?`, confirmLabel: "Reset", run: () => api.userAction(token ?? "", accessUser.id, "reset-password"), success: "Password reset placeholder logged." });
            }}
            onStatusAction={(accessUser, action) => {
              const protectedMessage = protectedOwnerMessage(accessUser);
              if ((action === "disable" || action === "lock") && protectedMessage) return;
              setConfirmAction({ title: `${action} user`, description: `${action} ${accessUser.name}?`, confirmLabel: action, tone: action === "disable" || action === "lock" ? "danger" : "default", run: () => api.userAction(token ?? "", accessUser.id, action), success: `User ${action} action completed.` });
            }}
          />
        ) : null}

        {activeTab === "roles" ? (
          <RolesTable
            roles={filteredRoles}
            loading={loading}
            query={roleQuery}
            onQueryChange={setRoleQuery}
            onView={(role) => setRoleModal({ mode: "view", role })}
            onEdit={(role) => setRoleModal({ mode: "edit", role })}
            onPermissions={(role) => setRoleModal({ mode: "permissions", role })}
            onAction={(role, action) => {
              if (role.is_protected && action === "disable") return;
              setConfirmAction({ title: `${action} role`, description: `${action} role ${role.name}?`, confirmLabel: action, tone: action === "disable" ? "danger" : "default", run: () => api.roleAction(token ?? "", role.id, action), success: `Role ${action} action completed.` });
            }}
          />
        ) : null}

        {activeTab === "permissions" ? (
          <PermissionsTable
            permissions={filteredPermissions}
            allPermissions={permissions}
            loading={loading}
            query={permissionQuery}
            moduleFilter={permissionModuleFilter}
            criticalFilter={permissionCriticalFilter}
            onQueryChange={setPermissionQuery}
            onModuleFilterChange={setPermissionModuleFilter}
            onCriticalFilterChange={setPermissionCriticalFilter}
          />
        ) : null}

        {activeTab === "role_mappings" ? (
          <RoleMappingsTable
            mappings={filteredRoleMappings}
            loading={loading}
            query={mappingQuery}
            canManage={canManageMappings}
            onQueryChange={setMappingQuery}
            onEdit={(mapping) => setMappingModal({ mode: "edit", mapping })}
            onAction={(mapping, action) => {
              setConfirmAction({ title: `${action} role mapping`, description: `${action} role mapping ${mapping.name}?`, confirmLabel: action, tone: action === "disable" ? "danger" : "default", run: () => api.roleMappingAction(token ?? "", mapping.id, action), success: `Role mapping ${action} action completed.` });
            }}
          />
        ) : null}

        {activeTab === "access_scopes" ? (
          <AccessScopesTable
            scopes={filteredAccessScopes}
            loading={loading}
            query={scopeQuery}
            moduleFilter={scopeModuleFilter}
            ownerFilter={scopeOwnerFilter}
            canManage={canManageScopes}
            onQueryChange={setScopeQuery}
            onModuleFilterChange={setScopeModuleFilter}
            onOwnerFilterChange={setScopeOwnerFilter}
            onEdit={(scope) => setScopeModal({ mode: "edit", scope })}
            onAction={(scope, action) => {
              setConfirmAction({ title: `${action} access scope`, description: `${action} access scope ${scope.name}?`, confirmLabel: action, tone: action === "disable" ? "danger" : "default", run: () => api.accessScopeAction(token ?? "", scope.id, action), success: `Access scope ${action} action completed.` });
            }}
          />
        ) : null}
      </Panel>

      {userModal ? (
        <UserFormModal
          mode={userModal.mode}
          user={userModal.user}
          roles={roles}
          ownerRole={ownerRole}
          activeOwnerCount={activeOwnerCount}
          onClose={() => setUserModal(null)}
          onSubmit={(input) =>
            runAction(async () => {
              if (!token) return;
              if (userModal.mode === "create") {
                await api.createUser(token, input as UserCreateInput);
              } else if (userModal.mode === "assign" && userModal.user) {
                await api.assignUserRoles(token, userModal.user.id, input.role_ids);
              } else if (userModal.user) {
                await api.updateUser(token, userModal.user.id, input as UserUpdateInput);
              }
              setUserModal(null);
            }, "User saved.")
          }
        />
      ) : null}

      {roleModal ? (
        <RoleFormModal
          mode={roleModal.mode}
          role={roleModal.role}
          permissions={permissions}
          onClose={() => setRoleModal(null)}
          onSubmit={(input) =>
            runAction(async () => {
              if (!token) return;
              if (roleModal.mode === "create") {
                await api.createRole(token, input as RoleFormInput);
              } else if (roleModal.mode === "permissions" && roleModal.role) {
                await api.setRolePermissions(token, roleModal.role.id, (input as RolePermissionInput).permissions);
              } else if (roleModal.role) {
                await api.updateRole(token, roleModal.role.id, input as RoleFormInput);
              }
              setRoleModal(null);
            }, "Role saved.")
          }
        />
      ) : null}

      {mappingModal ? (
        <RoleMappingModal
          mode={mappingModal.mode}
          mapping={mappingModal.mapping}
          roles={roles}
          departments={departments}
          locations={locations}
          positions={positions}
          jobLevels={jobLevels}
          onClose={() => setMappingModal(null)}
          onSubmit={(input) =>
            runAction(async () => {
              if (!token) return;
              if (mappingModal.mode === "create") await api.createRoleMapping(token, input);
              else if (mappingModal.mapping) await api.updateRoleMapping(token, mappingModal.mapping.id, input);
              setMappingModal(null);
            }, "Role mapping saved.")
          }
        />
      ) : null}

      {scopeModal ? (
        <AccessScopeModal
          mode={scopeModal.mode}
          scope={scopeModal.scope}
          roles={roles}
          users={users}
          roleMappings={roleMappings}
          departments={departments}
          locations={locations}
          onClose={() => setScopeModal(null)}
          onSubmit={(input) =>
            runAction(async () => {
              if (!token) return;
              if (scopeModal.mode === "create") await api.createAccessScope(token, input);
              else if (scopeModal.scope) await api.updateAccessScope(token, scopeModal.scope.id, input);
              setScopeModal(null);
            }, "Access scope saved.")
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title ?? "Confirm action"}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        tone={confirmAction?.tone ?? "default"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          const pendingAction = confirmAction;
          setConfirmAction(null);
          void runAction(pendingAction.run, pendingAction.success);
        }}
      />

      <div className="text-xs text-muted-foreground">
        Signed in as {currentUser?.name}. Backend permissions remain the source of truth for every action.
      </div>
    </PageShell>
  );
}

interface UsersTableProps {
  users: AccessUser[];
  roles: Role[];
  loading: boolean;
  query: string;
  statusFilter: string;
  roleFilter: string;
  activeOwnerCount: number;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onView: (user: AccessUser) => void;
  onEdit: (user: AccessUser) => void;
  onAssign: (user: AccessUser) => void;
  onReset: (user: AccessUser) => void;
  onStatusAction: (user: AccessUser, action: "enable" | "disable" | "lock" | "unlock") => void;
}

function UsersTable(props: UsersTableProps) {
  return (
    <div>
      <UsersAccessFilterBar>
        <UsersAccessSearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search users" />
        <Select value={props.statusFilter} onChange={props.onStatusFilterChange}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="LOCKED">Locked</option>
        </Select>
        <MoreFiltersSheet title="User filters" onReset={() => props.onRoleFilterChange("ALL")}>
          <FilterSection title="Role">
            <Select value={props.roleFilter} onChange={props.onRoleFilterChange}>
              <option value="ALL">All roles</option>
              {props.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </FilterSection>
        </MoreFiltersSheet>
        <FilterResetButton onReset={() => { props.onQueryChange(""); props.onStatusFilterChange("ALL"); props.onRoleFilterChange("ALL"); }} />
      </UsersAccessFilterBar>
      {props.loading ? <LoadingRow text="Loading users" /> : null}
      {!props.loading && props.users.length === 0 ? <EmptyState title="No users found" description="Adjust filters or create a user." /> : null}
      {!props.loading && props.users.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Linked employee</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[220px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.users.map((accessUser) => {
                const lastOwner = accessUser.is_owner && accessUser.status === "ACTIVE" && props.activeOwnerCount <= 1;
                return (
                  <TableRow key={accessUser.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {accessUser.name}
                        {accessUser.is_owner ? <Badge tone="info">Protected</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{accessUser.email}</TableCell>
                    <TableCell className="text-muted-foreground">{accessUser.username ?? "-"}</TableCell>
                    <TableCell>
                      <Badge tone={statusTone(accessUser.status)}>{accessUser.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {accessUser.roles.length ? accessUser.roles.map((role) => <Badge key={role}>{role}</Badge>) : <span className="text-muted-foreground">No roles</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{accessUser.employee_id ?? "Standalone"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(accessUser.last_login_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{compactDate(accessUser.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <IconAction title="View" onClick={() => props.onView(accessUser)} icon={<Eye className="h-4 w-4" />} />
                        <IconAction title="Edit" onClick={() => props.onEdit(accessUser)} icon={<Edit className="h-4 w-4" />} />
                        <IconAction title="Assign roles" onClick={() => props.onAssign(accessUser)} icon={<UserCog className="h-4 w-4" />} />
                        {accessUser.status === "ACTIVE" ? (
                          <IconAction
                            title={lastOwner ? "Last active Owner is protected" : "Disable"}
                            disabled={lastOwner}
                            onClick={() => props.onStatusAction(accessUser, "disable")}
                            icon={<XCircle className="h-4 w-4" />}
                          />
                        ) : (
                          <IconAction title="Enable" onClick={() => props.onStatusAction(accessUser, "enable")} icon={<CheckCircle2 className="h-4 w-4" />} />
                        )}
                        {accessUser.status === "LOCKED" ? (
                          <IconAction title="Unlock" onClick={() => props.onStatusAction(accessUser, "unlock")} icon={<Unlock className="h-4 w-4" />} />
                        ) : (
                          <IconAction
                            title={lastOwner ? "Last active Owner is protected" : "Lock"}
                            disabled={lastOwner}
                            onClick={() => props.onStatusAction(accessUser, "lock")}
                            icon={<Lock className="h-4 w-4" />}
                          />
                        )}
                        <IconAction title="Reset password" onClick={() => props.onReset(accessUser)} icon={<KeyRound className="h-4 w-4" />} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

interface RolesTableProps {
  roles: Role[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onView: (role: Role) => void;
  onEdit: (role: Role) => void;
  onPermissions: (role: Role) => void;
  onAction: (role: Role, action: "enable" | "disable") => void;
}

function RolesTable(props: RolesTableProps) {
  return (
    <div>
      <UsersAccessFilterBar>
        <UsersAccessSearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search roles" />
        <FilterResetButton onReset={() => props.onQueryChange("")} />
      </UsersAccessFilterBar>
      {props.loading ? <LoadingRow text="Loading roles" /> : null}
      {!props.loading && props.roles.length === 0 ? <EmptyState title="No roles found" description="Create a role template to assign permissions." /> : null}
      {!props.loading && props.roles.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[940px]">
            <TableHeader>
              <TableRow>
                <TableHead>Role name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="max-w-sm text-muted-foreground">{role.description ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {role.is_system_role ? <Badge tone="info">System</Badge> : <Badge>Template</Badge>}
                      {role.is_protected ? <Badge tone="warning">Protected</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={role.is_active ? "success" : "danger"}>{role.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell>{role.permission_count}</TableCell>
                  <TableCell>{role.user_count}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <IconAction title="View" onClick={() => props.onView(role)} icon={<Eye className="h-4 w-4" />} />
                      <IconAction title="Edit" onClick={() => props.onEdit(role)} icon={<Edit className="h-4 w-4" />} />
                      <IconAction title="Assign permissions" onClick={() => props.onPermissions(role)} icon={<SlidersHorizontal className="h-4 w-4" />} />
                      {role.is_active ? (
                        <IconAction
                          title={role.is_protected ? "Protected role cannot be disabled" : "Disable"}
                          disabled={role.is_protected}
                          onClick={() => props.onAction(role, "disable")}
                          icon={<XCircle className="h-4 w-4" />}
                        />
                      ) : (
                        <IconAction title="Enable" onClick={() => props.onAction(role, "enable")} icon={<CheckCircle2 className="h-4 w-4" />} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

interface PermissionsTableProps {
  permissions: Permission[];
  allPermissions: Permission[];
  loading: boolean;
  query: string;
  moduleFilter: string;
  criticalFilter: string;
  onQueryChange: (value: string) => void;
  onModuleFilterChange: (value: string) => void;
  onCriticalFilterChange: (value: string) => void;
}

function PermissionsTable(props: PermissionsTableProps) {
  const modules = Array.from(new Set(props.allPermissions.map((permission) => permission.module)));
  return (
    <div>
      <UsersAccessFilterBar>
        <UsersAccessSearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search permissions" />
        <MoreFiltersSheet title="Permission filters" onReset={() => { props.onModuleFilterChange("ALL"); props.onCriticalFilterChange("ALL"); }}>
          <FilterSection title="Registry">
            <Select value={props.moduleFilter} onChange={props.onModuleFilterChange}>
              <option value="ALL">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {MODULE_LABELS[module] ?? module}
                </option>
              ))}
            </Select>
            <Select value={props.criticalFilter} onChange={props.onCriticalFilterChange}>
              <option value="ALL">All criticality</option>
              <option value="CRITICAL">Critical</option>
              <option value="NON_CRITICAL">Non-critical</option>
            </Select>
          </FilterSection>
        </MoreFiltersSheet>
        <FilterResetButton onReset={() => { props.onQueryChange(""); props.onModuleFilterChange("ALL"); props.onCriticalFilterChange("ALL"); }} />
      </UsersAccessFilterBar>
      {props.loading ? <LoadingRow text="Loading permissions" /> : null}
      {!props.loading && props.permissions.length === 0 ? <EmptyState title="No permissions found" description="Adjust filters to view the registry." /> : null}
      {!props.loading && props.permissions.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Critical</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.permissions.map((permission) => (
                <TableRow key={permission.key}>
                  <TableCell className="font-mono text-xs">{permission.key}</TableCell>
                  <TableCell>{MODULE_LABELS[permission.module] ?? permission.module}</TableCell>
                  <TableCell className="text-muted-foreground">{permission.description ?? "-"}</TableCell>
                  <TableCell>{permission.is_critical ? <Badge tone="warning">Critical</Badge> : <Badge>Standard</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function RoleMappingsTable(props: {
  mappings: RoleMappingRule[];
  loading: boolean;
  query: string;
  canManage: boolean;
  onQueryChange: (value: string) => void;
  onEdit: (mapping: RoleMappingRule) => void;
  onAction: (mapping: RoleMappingRule, action: "enable" | "disable") => void;
}) {
  return (
    <div>
      <UsersAccessFilterBar><UsersAccessSearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search role mappings" /><FilterResetButton onReset={() => props.onQueryChange("")} /></UsersAccessFilterBar>
      <div className="border-b bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <div className="font-medium">Roles decide what the user can do. Scopes decide which employees, departments, and locations the user can access.</div>
        <div className="mt-1 text-xs">Examples: Employee Self-Service + SELF_ONLY, Store Manager + OWN_LOCATION, Finance Payroll Manager + SELECTED_LOCATIONS, HR Manager + WHOLE_COMPANY, HR Head + WHOLE_COMPANY. Higher priority rules win when multiple mappings match.</div>
      </div>
      {props.loading ? <LoadingRow text="Loading role mappings" /> : null}
      {!props.loading && props.mappings.length === 0 ? <EmptyState title="No role mappings found" description="Create access templates that suggest roles and data scopes for employee-linked users." /> : null}
      {!props.loading && props.mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Suggested role</TableHead><TableHead>Matching criteria</TableHead><TableHead>Suggested scope</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead className="w-[120px] text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{props.mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell><div className="font-medium">{mapping.name}</div><div className="truncate text-xs text-muted-foreground">{mapping.description ?? "No description"}</div></TableCell>
                <TableCell>{mapping.role_name ?? mapping.default_role_id}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{mapping.employee_type ? <Badge>{mapping.employee_type}</Badge> : null}{mapping.employment_type ? <Badge>{mapping.employment_type}</Badge> : null}{mapping.department_name ? <Badge>{mapping.department_name}</Badge> : null}{mapping.position_title ? <Badge>{mapping.position_title}</Badge> : null}{mapping.location_name ? <Badge>{mapping.location_name}</Badge> : null}{mapping.job_level_name ? <Badge>{mapping.job_level_name}</Badge> : null}{!mapping.employee_type && !mapping.employment_type && !mapping.department_id && !mapping.position_id && !mapping.location_id && !mapping.job_level_id ? <Badge tone="warning">Fallback</Badge> : null}</div></TableCell>
                <TableCell><div className="flex flex-wrap gap-1"><Badge tone={mapping.default_scope_type === "WHOLE_COMPANY" ? "warning" : undefined}>{SCOPE_TYPE_LABELS[mapping.default_scope_type]}</Badge>{mapping.can_view ? <Badge tone="success">View</Badge> : null}{mapping.can_manage ? <Badge tone="warning">Manage</Badge> : null}</div></TableCell>
                <TableCell>{mapping.priority}</TableCell>
                <TableCell>{mapping.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</TableCell>
                <TableCell><div className="flex justify-end gap-1"><IconAction title="Edit mapping" onClick={() => props.onEdit(mapping)} icon={<Edit className="h-4 w-4" />} disabled={!props.canManage} /><IconAction title={mapping.is_active ? "Disable mapping" : "Enable mapping"} onClick={() => props.onAction(mapping, mapping.is_active ? "disable" : "enable")} icon={mapping.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />} disabled={!props.canManage} /></div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function AccessScopesTable(props: {
  scopes: AccessScopeRule[];
  loading: boolean;
  query: string;
  moduleFilter: string;
  ownerFilter: string;
  canManage: boolean;
  onQueryChange: (value: string) => void;
  onModuleFilterChange: (value: string) => void;
  onOwnerFilterChange: (value: string) => void;
  onEdit: (scope: AccessScopeRule) => void;
  onAction: (scope: AccessScopeRule, action: "enable" | "disable") => void;
}) {
  return (
    <div>
      <UsersAccessFilterBar>
        <UsersAccessSearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search scopes" />
        <MoreFiltersSheet title="Access scope filters" onReset={() => { props.onModuleFilterChange("ALL"); props.onOwnerFilterChange("ALL"); }}>
          <FilterSection title="Scope">
            <Select value={props.moduleFilter} onChange={props.onModuleFilterChange}><option value="ALL">All modules</option><option value="ALL_MODULES">All-module rules</option>{ACCESS_SCOPE_MODULES.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] ?? module}</option>)}</Select>
            <Select value={props.ownerFilter} onChange={props.onOwnerFilterChange}><option value="ALL">All owners</option><option value="ROLE">Role</option><option value="USER">User</option><option value="ROLE_MAPPING_RULE">Role mapping</option></Select>
          </FilterSection>
        </MoreFiltersSheet>
        <FilterResetButton onReset={() => { props.onQueryChange(""); props.onModuleFilterChange("ALL"); props.onOwnerFilterChange("ALL"); }} />
      </UsersAccessFilterBar>
      <div className="border-b bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <div className="font-medium">Roles control what a user can do. Scopes control which employees, departments, and locations the user can access.</div>
        <div className="mt-1 text-xs">Role mapping scopes are templates. When a mapping is applied, HRM v2 copies those templates to the linked user and updates the existing mapped scope on later applies.</div>
      </div>
      {props.loading ? <LoadingRow text="Loading access scopes" /> : null}
      {!props.loading && props.scopes.length === 0 ? <EmptyState title="No access scopes found" description="Create role or user scopes to limit employee data by department, location, team, or company." /> : null}
      {!props.loading && props.scopes.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Module</TableHead><TableHead>Scope</TableHead><TableHead>Rights</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="w-[120px] text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{props.scopes.map((scope) => {
              const owner = scope.scope_owner_type === "ROLE" ? scope.role_name ?? scope.role_id : scope.scope_owner_type === "USER" ? `${scope.user_name ?? "User"}${scope.user_email ? ` (${scope.user_email})` : ""}` : scope.role_mapping_name ?? scope.role_mapping_rule_id ?? "Role mapping rule";
              return <TableRow key={scope.id}><TableCell><div className="font-medium">{scope.name}</div><div className="truncate text-xs text-muted-foreground">{scope.description ?? "No description"}</div></TableCell><TableCell>{owner}</TableCell><TableCell>{scope.module_key ? MODULE_LABELS[scope.module_key] ?? scope.module_key : "All scoped modules"}</TableCell><TableCell><Badge tone={scope.scope_type === "WHOLE_COMPANY" ? "warning" : undefined}>{SCOPE_TYPE_LABELS[scope.scope_type]}</Badge></TableCell><TableCell><div className="flex flex-wrap gap-1">{scope.can_view ? <Badge tone="success">View</Badge> : null}{scope.can_manage ? <Badge tone="warning">Manage</Badge> : null}</div></TableCell><TableCell>{scope.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</TableCell><TableCell>{formatDate(scope.updated_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><IconAction title="Edit scope" onClick={() => props.onEdit(scope)} icon={<Edit className="h-4 w-4" />} disabled={!props.canManage} /><IconAction title={scope.is_active ? "Disable scope" : "Enable scope"} onClick={() => props.onAction(scope, scope.is_active ? "disable" : "enable")} icon={scope.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />} disabled={!props.canManage} /></div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

type UserCreateInput = { name: string; email: string; username?: string; password: string; status: UserStatus; role_ids: string[] };
type UserUpdateInput = Omit<UserCreateInput, "password" | "status">;

function UserFormModal(props: {
  mode: UserModalMode;
  user?: AccessUser;
  roles: Role[];
  ownerRole?: Role;
  activeOwnerCount: number;
  onClose: () => void;
  onSubmit: (input: UserCreateInput | UserUpdateInput) => Promise<void>;
}) {
  const [name, setName] = useState(props.user?.name ?? "");
  const [email, setEmail] = useState(props.user?.email ?? "");
  const [username, setUsername] = useState(props.user?.username ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<UserStatus>(props.user?.status ?? "ACTIVE");
  const [roleIds, setRoleIds] = useState<string[]>(props.user?.role_ids ?? []);
  const [validation, setValidation] = useState("");
  const assignOnly = props.mode === "assign";
  const isCreate = props.mode === "create";
  const lastOwner = props.user?.is_owner && props.user.status === "ACTIVE" && props.activeOwnerCount <= 1;

  function toggleRole(role: Role) {
    if (!role.is_active) return;
    const next = roleIds.includes(role.id) ? roleIds.filter((id) => id !== role.id) : [...roleIds, role.id];
    if (lastOwner && props.ownerRole && !next.includes(props.ownerRole.id)) {
      setValidation("The last active Owner user cannot lose the Owner role.");
      return;
    }
    setValidation("");
    setRoleIds(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!assignOnly && !name.trim()) {
      setValidation("Name is required.");
      return;
    }
    if (!assignOnly && !email.includes("@")) {
      setValidation("A valid email address is required.");
      return;
    }
    if (isCreate && password.length < 12) {
      setValidation("Password must be at least 12 characters.");
      return;
    }
    await props.onSubmit(
      isCreate
        ? { name, email, username, password, status, role_ids: roleIds }
        : { name, email, username, role_ids: roleIds }
    );
  }

  return (
    <Modal title={isCreate ? "Create user" : assignOnly ? "Assign roles" : "Edit user"} onClose={props.onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {!assignOnly ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </Field>
            <Field label="Username">
              <Input value={username ?? ""} onChange={(event) => setUsername(event.target.value)} />
            </Field>
            {isCreate ? (
              <Field label="Status">
                <Select value={status} onChange={(value) => setStatus(value as UserStatus)}>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                  <option value="LOCKED">Locked</option>
                </Select>
              </Field>
            ) : null}
            {isCreate ? (
              <Field label="Password">
                <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={12} required />
              </Field>
            ) : null}
            <Field label="Employee link">
              <Input value="Employee profile linking is prepared for a later phase" disabled />
            </Field>
          </div>
        ) : null}
        <div>
          <Label>Roles</Label>
          <div className="mt-2 max-h-60 overflow-y-auto rounded-md border">
            {props.roles.map((role) => (
              <CheckboxField
                key={role.id}
                checked={roleIds.includes(role.id)}
                disabled={!role.is_active || Boolean(lastOwner && props.ownerRole?.id === role.id)}
                onChange={() => toggleRole(role)}
                className={cn("items-start rounded-none border-0 border-b last:border-b-0", !role.is_active && "opacity-50")}
                label={(
                  <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {role.name}
                    {role.is_protected ? <Badge tone="warning">Protected</Badge> : null}
                    {!role.is_active ? <Badge tone="danger">Inactive</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{role.description ?? "No description"}</span>
                  </span>
                )}
              />
            ))}
          </div>
        </div>
        {lastOwner ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Last active Owner protections are locked.</div> : null}
        {validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}
        <ModalActions onCancel={props.onClose} submitLabel="Save user" />
      </form>
    </Modal>
  );
}

type RoleFormInput = { name: string; description?: string; is_active?: boolean };
type RolePermissionInput = { permissions: string[] };

function RoleFormModal(props: {
  mode: RoleModalMode;
  role?: Role;
  permissions: Permission[];
  onClose: () => void;
  onSubmit: (input: RoleFormInput | RolePermissionInput) => Promise<void>;
}) {
  const [name, setName] = useState(props.role?.name ?? "");
  const [description, setDescription] = useState(props.role?.description ?? "");
  const [isActive, setIsActive] = useState(props.role?.is_active ?? true);
  const [permissionKeys, setPermissionKeys] = useState<string[]>(props.role?.permissions ?? []);
  const [validation, setValidation] = useState("");
  const permissionMode = props.mode === "permissions" || props.mode === "view";
  const readonly = props.mode === "view";
  const groupedPermissions = props.permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    groups[permission.module] = groups[permission.module] ?? [];
    groups[permission.module].push(permission);
    return groups;
  }, {});

  function togglePermission(permission: Permission) {
    if (readonly) return;
    if (props.role?.is_protected && permission.is_critical) return;
    setPermissionKeys((current) =>
      current.includes(permission.key) ? current.filter((key) => key !== permission.key) : [...current, permission.key]
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (permissionMode) {
      await props.onSubmit({ permissions: permissionKeys });
      return;
    }
    if (!name.trim()) {
      setValidation("Role name is required.");
      return;
    }
    await props.onSubmit({ name, description, is_active: props.role?.is_protected ? true : isActive });
  }

  return (
    <Modal title={props.mode === "create" ? "Create role" : permissionMode ? `${props.role?.name} permissions` : "Edit role"} onClose={props.onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        {!permissionMode ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role name">
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Active status">
              <Select value={isActive ? "ACTIVE" : "INACTIVE"} onChange={(value) => setIsActive(value === "ACTIVE")} disabled={props.role?.is_protected}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Input value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {props.role?.is_protected ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Critical Owner permissions cannot be removed.
              </div>
            ) : null}
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto md:grid-cols-2">
              {Object.entries(groupedPermissions).map(([module, modulePermissions]) => (
                <div key={module} className="rounded-md border">
                  <div className="border-b bg-muted/60 px-3 py-2 text-sm font-semibold">{MODULE_LABELS[module] ?? module}</div>
                  <div className="divide-y">
                    {modulePermissions.map((permission) => {
                      const locked = Boolean(props.role?.is_protected && permission.is_critical);
                      return (
                        <CheckboxField
                          key={permission.key}
                          checked={permissionKeys.includes(permission.key) || locked}
                          disabled={readonly || locked}
                          onChange={() => togglePermission(permission)}
                          className="items-start rounded-none border-0 px-3 py-2"
                          label={(
                            <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
                              {permission.key}
                              {permission.is_critical ? <Badge tone="warning">Critical</Badge> : null}
                              {locked ? <ShieldAlert className="h-4 w-4 text-amber-700" /> : null}
                            </span>
                            <span className="block text-xs text-muted-foreground">{permission.description}</span>
                            </span>
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}
        <ModalActions onCancel={props.onClose} submitLabel={readonly ? "Close" : "Save role"} submitDisabled={readonly} />
      </form>
    </Modal>
  );
}

function RoleMappingModal(props: {
  mode: MappingModalMode;
  mapping?: RoleMappingRule;
  roles: Role[];
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  positions: OrganizationPosition[];
  jobLevels: OrganizationJobLevel[];
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(props.mapping?.name ?? "");
  const [description, setDescription] = useState(props.mapping?.description ?? "");
  const [defaultRoleId, setDefaultRoleId] = useState(props.mapping?.default_role_id ?? "");
  const [employeeType, setEmployeeType] = useState(props.mapping?.employee_type ?? "");
  const [employmentType, setEmploymentType] = useState(props.mapping?.employment_type ?? "");
  const [departmentId, setDepartmentId] = useState(props.mapping?.department_id ?? "");
  const [positionId, setPositionId] = useState(props.mapping?.position_id ?? "");
  const [locationId, setLocationId] = useState(props.mapping?.location_id ?? "");
  const [jobLevelId, setJobLevelId] = useState(props.mapping?.job_level_id ?? "");
  const [scopeType, setScopeType] = useState<AccessScopeType>(props.mapping?.default_scope_type ?? "SELF_ONLY");
  const [departmentIds, setDepartmentIds] = useState<string[]>(props.mapping?.allowed_department_ids ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(props.mapping?.allowed_location_ids ?? []);
  const [includeSubDepartments, setIncludeSubDepartments] = useState(props.mapping?.include_sub_departments ?? false);
  const [includeReportingChain, setIncludeReportingChain] = useState(props.mapping?.include_reporting_chain ?? false);
  const [canView, setCanView] = useState(props.mapping?.can_view ?? true);
  const [canManage, setCanManage] = useState(props.mapping?.can_manage ?? false);
  const [priority, setPriority] = useState(String(props.mapping?.priority ?? 100));
  const [isActive, setIsActive] = useState(props.mapping?.is_active ?? true);
  const [validation, setValidation] = useState("");
  const assignableRoles = props.roles.filter((role) => role.is_active && !role.is_protected);
  const scopedDepartmentIds = scopeType === "SELECTED_DEPARTMENTS" ? departmentIds : undefined;
  const scopedLocationIds = scopeType === "SELECTED_LOCATIONS" ? locationIds : undefined;
  const roleMappingDepartmentOutsideScopeCode = "ROLE_MAPPING_DEPARTMENT_OUTSIDE_SCOPE";
  const roleMappingLocationOutsideScopeCode = "ROLE_MAPPING_LOCATION_OUTSIDE_SCOPE";
  const mappingValidationCode = validation?.includes("department")
    ? roleMappingDepartmentOutsideScopeCode
    : validation?.includes("location")
      ? roleMappingLocationOutsideScopeCode
      : "ROLE_MAPPING_VALIDATION";
  const mappingValidationIssues: ValidationIssue[] = validation ? [{ code: mappingValidationCode, message: validation, severity: "error" }] : [];
  const blockingMappingIssues = mappingValidationIssues.filter((issue) => issue.severity === "error");
  const warningMappingIssues = mappingValidationIssues.filter((issue) => issue.severity === "warning");
  const updateCascade = (next: { locationId?: string; departmentId?: string; jobLevelId?: string; positionId?: string }) => {
    setLocationId(next.locationId ?? "");
    setDepartmentId(next.departmentId ?? "");
    setJobLevelId(next.jobLevelId ?? "");
    setPositionId(next.positionId ?? "");
  };

  useEffect(() => {
    if (scopeType === "SELECTED_DEPARTMENTS" && departmentId && !departmentIds.includes(departmentId)) {
      setDepartmentId("");
      setJobLevelId("");
      setPositionId("");
    }
  }, [departmentId, departmentIds, scopeType]);

  useEffect(() => {
    if (scopeType === "SELECTED_LOCATIONS" && locationId && !locationIds.includes(locationId)) {
      setLocationId("");
    }
  }, [locationId, locationIds, scopeType]);

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!name.trim()) return setValidation("Mapping name is required.");
    if (!defaultRoleId) return setValidation("Default role is required.");
    if (scopeType === "SELECTED_DEPARTMENTS" && departmentIds.length === 0) return setValidation("Select at least one allowed department.");
    if (scopeType === "SELECTED_LOCATIONS" && locationIds.length === 0) return setValidation("Select at least one allowed location.");
    if (scopeType === "SELECTED_DEPARTMENTS" && departmentId && !departmentIds.includes(departmentId)) return setValidation("Selected mapping department is outside the allowed department scope.");
    if (scopeType === "SELECTED_LOCATIONS" && locationId && !locationIds.includes(locationId)) return setValidation("Selected mapping location is outside the allowed location scope.");
    await props.onSubmit({ name, description: description || null, default_role_id: defaultRoleId, employee_type: employeeType || null, employment_type: employmentType || null, department_id: departmentId || null, position_id: positionId || null, location_id: locationId || null, job_level_id: jobLevelId || null, default_scope_type: scopeType, allowed_department_ids: departmentIds, allowed_location_ids: locationIds, include_sub_departments: includeSubDepartments, include_reporting_chain: includeReportingChain, can_view: canView, can_manage: canManage, priority: Number(priority) || 100, is_active: isActive });
  }
  return (
    <Modal title={props.mode === "create" ? "Create role mapping" : "Edit role mapping"} onClose={props.onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Mapping name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Default role"><Select value={defaultRoleId} onChange={setDefaultRoleId}><option value="">Select role</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select><p className="text-xs text-muted-foreground">Protected Owner/Super Admin roles cannot be assigned through mapping.</p></Field>
          <Field label="Employee type"><Select value={employeeType} onChange={setEmployeeType}><option value="">Any employee type</option><option value="LOCAL">Local</option><option value="FOREIGN">Foreign</option><option value="OTHER">Other</option></Select></Field>
          <Field label="Employment type"><Select value={employmentType} onChange={setEmploymentType}><option value="">Any employment type</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="INTERN">Intern</option><option value="TEMPORARY">Temporary</option><option value="CONTRACT">Contract</option></Select></Field>
          <div className="md:col-span-2">
            <OrganizationCascadeSelector
              includeLocation
              departments={props.departments}
              locations={props.locations}
              jobLevels={props.jobLevels}
              positions={props.positions}
              allowedDepartmentIds={scopedDepartmentIds}
              allowedLocationIds={scopedLocationIds}
              mode="role-mapping"
              childPrerequisiteMessage="Select allowed department scope first"
              value={{ locationId, departmentId, jobLevelId, positionId }}
              labels={{ departmentId: "Department", jobLevelId: "Job level", positionId: "Position", locationId: "Location/outlet" }}
              onChange={updateCascade}
              className="grid gap-3 md:grid-cols-2"
            />
          </div>
          <Field label="Default scope"><Select value={scopeType} onChange={(value) => setScopeType(value as AccessScopeType)}>{Object.entries(SCOPE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Priority"><Input type="number" value={priority} onChange={(event) => setPriority(event.target.value)} /><p className="text-xs text-muted-foreground">Higher priority rules win when multiple mappings match.</p></Field>
          <Field label="Active status"><Select value={isActive ? "ACTIVE" : "INACTIVE"} onChange={(value) => setIsActive(value === "ACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></Field>
          <div className="md:col-span-2"><Field label="Description"><Input value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div>
        </div>
        {scopeType === "SELECTED_DEPARTMENTS" ? <ChecklistPanel title="Allowed departments" empty="No departments configured." items={props.departments.map((department) => ({ id: department.id, label: `${department.code} - ${department.name}` }))} selected={departmentIds} onToggle={(id) => toggle(departmentIds, id, setDepartmentIds)} /> : null}
        {scopeType === "SELECTED_LOCATIONS" ? <ChecklistPanel title="Allowed locations" empty="No locations configured." items={props.locations.map((location) => ({ id: location.id, label: `${location.code} - ${location.name}` }))} selected={locationIds} onToggle={(id) => toggle(locationIds, id, setLocationIds)} /> : null}
        <div className="grid gap-3 md:grid-cols-2"><Check label="Include sub-departments" checked={includeSubDepartments} onChange={setIncludeSubDepartments} /><Check label="Include reporting chain" checked={includeReportingChain} onChange={setIncludeReportingChain} /><Check label="Can view" checked={canView} onChange={setCanView} /><Check label="Can manage" checked={canManage} onChange={setCanManage} /></div>
        <ValidationSummary issues={mappingValidationIssues} />
        <FormBlockingAlert issues={blockingMappingIssues} />
        <FormWarningAlert issues={warningMappingIssues} />
        <ModalActions onCancel={props.onClose} submitLabel="Save mapping" />
      </form>
    </Modal>
  );
}

function AccessScopeModal(props: { mode: ScopeModalMode; scope?: AccessScopeRule; roles: Role[]; users: AccessUser[]; roleMappings: RoleMappingRule[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; onClose: () => void; onSubmit: (input: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(props.scope?.name ?? "");
  const [description, setDescription] = useState(props.scope?.description ?? "");
  const [ownerType, setOwnerType] = useState(props.scope?.scope_owner_type ?? "ROLE");
  const [roleId, setRoleId] = useState(props.scope?.role_id ?? "");
  const [userId, setUserId] = useState(props.scope?.user_id ?? "");
  const [roleMappingRuleId, setRoleMappingRuleId] = useState(props.scope?.role_mapping_rule_id ?? "");
  const [moduleKey, setModuleKey] = useState(props.scope?.module_key ?? "");
  const [scopeType, setScopeType] = useState<AccessScopeType>(props.scope?.scope_type ?? "OWN_DEPARTMENT");
  const [departmentIds, setDepartmentIds] = useState<string[]>(props.scope?.allowed_department_ids ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(props.scope?.allowed_location_ids ?? []);
  const [includeSubDepartments, setIncludeSubDepartments] = useState(props.scope?.include_sub_departments ?? false);
  const [includeReportingChain, setIncludeReportingChain] = useState(props.scope?.include_reporting_chain ?? false);
  const [canView, setCanView] = useState(props.scope?.can_view ?? true);
  const [canManage, setCanManage] = useState(props.scope?.can_manage ?? false);
  const [isActive, setIsActive] = useState(props.scope?.is_active ?? true);
  const [validation, setValidation] = useState("");
  const activeRoleMappings = props.roleMappings.filter((mapping) => mapping.is_active || mapping.id === roleMappingRuleId);
  function toggle(list: string[], value: string, setter: (next: string[]) => void) { setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!name.trim()) return setValidation("Scope name is required.");
    if (ownerType === "ROLE" && !roleId) return setValidation("Select a role owner.");
    if (ownerType === "USER" && !userId) return setValidation("Select a user owner.");
    if (ownerType === "ROLE_MAPPING_RULE" && !roleMappingRuleId.trim()) return setValidation("Select a role mapping rule for role-mapping scopes.");
    if (scopeType === "SELECTED_DEPARTMENTS" && departmentIds.length === 0) return setValidation("Select at least one department.");
    if (scopeType === "SELECTED_LOCATIONS" && locationIds.length === 0) return setValidation("Select at least one location.");
    if (!canView && !canManage) return setValidation("Select at least view or manage access.");
    await props.onSubmit({ name, description: description || null, scope_owner_type: ownerType, role_id: ownerType === "ROLE" ? roleId : null, user_id: ownerType === "USER" ? userId : null, role_mapping_rule_id: ownerType === "ROLE_MAPPING_RULE" ? roleMappingRuleId : null, module_key: moduleKey || null, scope_type: scopeType, allowed_department_ids: departmentIds, allowed_location_ids: locationIds, include_sub_departments: includeSubDepartments, include_reporting_chain: includeReportingChain, can_view: canView, can_manage: canManage, is_active: isActive });
  }
  return <Modal title={props.mode === "create" ? "Create access scope" : "Edit access scope"} onClose={props.onClose} wide><form className="space-y-4" onSubmit={submit}><div className="grid gap-3 md:grid-cols-2"><Field label="Scope name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Owner type"><Select value={ownerType} onChange={(value) => setOwnerType(value as typeof ownerType)}><option value="ROLE">Role template</option><option value="USER">User override</option><option value="ROLE_MAPPING_RULE">Role mapping rule</option></Select></Field>{ownerType === "ROLE" ? <Field label="Role"><Select value={roleId} onChange={setRoleId}><option value="">Select role</option>{props.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select></Field> : null}{ownerType === "USER" ? <Field label="User"><Select value={userId} onChange={setUserId}><option value="">Select user</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</Select></Field> : null}{ownerType === "ROLE_MAPPING_RULE" ? <Field label="Role mapping rule"><Select value={roleMappingRuleId} onChange={setRoleMappingRuleId}><option value="">Select role mapping</option>{activeRoleMappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name} - {mapping.role_name ?? mapping.default_role_id}</option>)}</Select></Field> : null}<Field label="Module"><Select value={moduleKey} onChange={setModuleKey}><option value="">All scoped modules</option>{ACCESS_SCOPE_MODULES.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] ?? module}</option>)}</Select></Field><Field label="Scope type"><Select value={scopeType} onChange={(value) => setScopeType(value as AccessScopeType)}>{Object.entries(SCOPE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Active status"><Select value={isActive ? "ACTIVE" : "INACTIVE"} onChange={(value) => setIsActive(value === "ACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></Field><div className="md:col-span-2"><Field label="Description"><Input value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div></div>{scopeType === "SELECTED_DEPARTMENTS" ? <ChecklistPanel title="Allowed departments" empty="No departments configured." items={props.departments.map((department) => ({ id: department.id, label: `${department.code} - ${department.name}` }))} selected={departmentIds} onToggle={(id) => toggle(departmentIds, id, setDepartmentIds)} /> : null}{scopeType === "SELECTED_LOCATIONS" ? <ChecklistPanel title="Allowed locations" empty="No locations configured." items={props.locations.map((location) => ({ id: location.id, label: `${location.code} - ${location.name}` }))} selected={locationIds} onToggle={(id) => toggle(locationIds, id, setLocationIds)} /> : null}<div className="grid gap-3 md:grid-cols-2"><Check label="Include sub-departments" checked={includeSubDepartments} onChange={setIncludeSubDepartments} /><Check label="Include reporting chain" checked={includeReportingChain} onChange={setIncludeReportingChain} /><Check label="Can view scoped records" checked={canView} onChange={setCanView} /><Check label="Can manage scoped records" checked={canManage} onChange={setCanManage} /></div>{scopeType === "WHOLE_COMPANY" ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Whole-company access should be reserved for Owner/Super Admin or tightly controlled access templates.</div> : null}{validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}<ModalActions onCancel={props.onClose} submitLabel="Save scope" /></form></Modal>;
}

function ChecklistPanel(props: { title: string; empty: string; items: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void }) {
  return <div className="rounded-md border"><div className="border-b bg-muted/60 px-3 py-2 text-sm font-semibold">{props.title}</div>{props.items.length === 0 ? <div className="px-3 py-4 text-sm text-muted-foreground">{props.empty}</div> : null}<div className="grid max-h-56 gap-0 overflow-y-auto sm:grid-cols-2">{props.items.map((item) => <CheckboxField key={item.id} label={<span className="truncate">{item.label}</span>} checked={props.selected.includes(item.id)} onChange={() => props.onToggle(item.id)} className="rounded-none border-0 border-b" />)}</div></div>;
}

function Check(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={props.label} checked={props.checked} onChange={props.onChange} />;
}

function Modal(props: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-lg border bg-white shadow-panel", props.wide ? "max-w-5xl" : "max-w-2xl")}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{props.title}</h2>
          <Button variant="ghost" size="icon" onClick={props.onClose} title="Close">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

function ModalActions(props: { onCancel: () => void; submitLabel: string; submitDisabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2 border-t pt-4">
      <Button variant="outline" onClick={props.onCancel}>
        Cancel
      </Button>
      {!props.submitDisabled ? (
        <Button type="submit">
          <ShieldCheck className="h-4 w-4" />
          {props.submitLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      {props.children}
    </div>
  );
}

function UsersAccessFilterBar(props: { children: React.ReactNode }) {
  return <div className="border-b bg-white p-3"><StandardFilterBar className="border-0 shadow-none">{props.children}</StandardFilterBar></div>;
}

function UsersAccessSearchInput(props: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return <StandardSearchInput value={props.value} onDebouncedChange={props.onChange} placeholder={props.placeholder} />;
}

function Select(props: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <UiSelectField
      value={props.value}
      onValueChange={props.onChange}
      disabled={props.disabled}
    >
      {props.children}
    </UiSelectField>
  );
}

function IconAction(props: { title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon" title={props.title} onClick={props.onClick} disabled={props.disabled}>
      {props.icon}
    </Button>
  );
}

function LoadingRow(props: { text: string }) {
  return <div className="border-b bg-white px-4 py-6 text-sm text-muted-foreground">{props.text}</div>;
}
