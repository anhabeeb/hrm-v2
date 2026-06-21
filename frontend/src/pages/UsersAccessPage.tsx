import {
  CheckCircle2,
  Edit,
  Eye,
  KeyRound,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
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
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import type { AccessUser, Permission, Role, UserStatus } from "../types/auth";

type Tab = "users" | "roles" | "permissions";
type UserModalMode = "create" | "edit" | "assign";
type RoleModalMode = "create" | "edit" | "permissions" | "view";

const MODULE_LABELS: Record<string, string> = {
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
  reports: "Reports",
  settings: "Settings",
  audit: "Audit"
};

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

  const [userModal, setUserModal] = useState<{ mode: UserModalMode; user?: AccessUser } | null>(null);
  const [roleModal, setRoleModal] = useState<{ mode: RoleModalMode; role?: Role } | null>(null);

  async function loadAccessData() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [userResult, roleResult, permissionResult] = await Promise.all([
        api.listUsers(token),
        api.listRoles(token),
        api.listPermissions(token)
      ]);
      setUsers(userResult.users);
      setRoles(roleResult.roles);
      setPermissions(permissionResult.permissions);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Users & Access could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccessData();
  }, [token]);

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Users & Access</h1>
          <p className="text-sm text-muted-foreground">Manage system users, role templates, and predefined permissions.</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {(["users", "roles", "permissions"] as Tab[]).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab)}
              className="capitalize"
            >
              {tab}
            </Button>
          ))}
        </div>

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
              if (window.confirm(`Trigger password reset placeholder for ${accessUser.name}?`)) {
                void runAction(() => api.userAction(token ?? "", accessUser.id, "reset-password"), "Password reset placeholder logged.");
              }
            }}
            onStatusAction={(accessUser, action) => {
              const protectedMessage = protectedOwnerMessage(accessUser);
              if ((action === "disable" || action === "lock") && protectedMessage) return;
              if (window.confirm(`${action} ${accessUser.name}?`)) {
                void runAction(() => api.userAction(token ?? "", accessUser.id, action), `User ${action} action completed.`);
              }
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
              if (window.confirm(`${action} role ${role.name}?`)) {
                void runAction(() => api.roleAction(token ?? "", role.id, action), `Role ${action} action completed.`);
              }
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

      <div className="text-xs text-muted-foreground">
        Signed in as {currentUser?.name}. Backend permissions remain the source of truth for every action.
      </div>
    </div>
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
      <FilterBar>
        <SearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search users" />
        <Select value={props.statusFilter} onChange={props.onStatusFilterChange}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="LOCKED">Locked</option>
        </Select>
        <Select value={props.roleFilter} onChange={props.onRoleFilterChange}>
          <option value="ALL">All roles</option>
          {props.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </FilterBar>
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
      <FilterBar>
        <SearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search roles" />
      </FilterBar>
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
      <FilterBar>
        <SearchInput value={props.query} onChange={props.onQueryChange} placeholder="Search permissions" />
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
      </FilterBar>
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
              <label key={role.id} className={cn("flex items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0", !role.is_active && "opacity-50")}>
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={roleIds.includes(role.id)}
                  disabled={!role.is_active || Boolean(lastOwner && props.ownerRole?.id === role.id)}
                  onChange={() => toggleRole(role)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {role.name}
                    {role.is_protected ? <Badge tone="warning">Protected</Badge> : null}
                    {!role.is_active ? <Badge tone="danger">Inactive</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{role.description ?? "No description"}</span>
                </span>
              </label>
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
                        <label key={permission.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <input
                            className="mt-1"
                            type="checkbox"
                            checked={permissionKeys.includes(permission.key) || locked}
                            disabled={readonly || locked}
                            onChange={() => togglePermission(permission)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
                              {permission.key}
                              {permission.is_critical ? <Badge tone="warning">Critical</Badge> : null}
                              {locked ? <ShieldAlert className="h-4 w-4 text-amber-700" /> : null}
                            </span>
                            <span className="block text-xs text-muted-foreground">{permission.description}</span>
                          </span>
                        </label>
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

function FilterBar(props: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-3">{props.children}</div>;
}

function SearchInput(props: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} className="pl-9" />
    </div>
  );
}

function Select(props: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      disabled={props.disabled}
      className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
    >
      {props.children}
    </select>
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
