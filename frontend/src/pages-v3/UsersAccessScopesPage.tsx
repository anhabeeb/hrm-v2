import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { USERS_ACCESS_NAV_ITEMS } from "./usersAccessNav";
import type { AccessScopeRule, AccessScopeType, AccessUser, Role, RoleMappingRule } from "../types/auth";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const SCOPE_TYPE_LABELS: Record<AccessScopeType, string> = {
  SELF_ONLY: "Self only", OWN_TEAM: "Own team", OWN_DEPARTMENT: "Own department", SELECTED_DEPARTMENTS: "Selected departments",
  OWN_LOCATION: "Own location", SELECTED_LOCATIONS: "Selected locations", ALL_LOCATIONS: "All locations", WHOLE_COMPANY: "Whole company"
};
const ACCESS_SCOPE_MODULES = ["employees", "documents", "leave", "attendance", "payroll", "roster", "assets", "reports", "dashboard", "self_service"];

export function UsersAccessScopesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [scopes, setScopes] = useState<AccessScopeRule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [roleMappings, setRoleMappings] = useState<RoleMappingRule[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; scope?: AccessScopeRule } | null>(null);

  const canManage = Boolean(user?.permissions.includes("access_scopes.manage"));

  async function load() {
    if (!token) return;
    setLoading(true);
    const [scopeResult, roleResult, userResult, mappingResult, departmentResult, locationResult] = await Promise.all([
      api.listAccessScopes(token), api.listRoles(token), api.listUsers(token), api.listRoleMappings(token), api.listDepartments(token), api.listLocations(token)
    ]);
    setScopes(scopeResult.access_scopes);
    setRoles(roleResult.roles);
    setUsers(userResult.users);
    setRoleMappings(mappingResult.role_mappings);
    setDepartments(departmentResult.departments);
    setLocations(locationResult.locations);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = scopes.filter((s) => !search || [s.name, s.description, s.role_name, s.user_name].some((v) => v?.toLowerCase().includes(search.toLowerCase())));

  async function toggleActive(scope: AccessScopeRule) {
    if (!token) return;
    try {
      await api.accessScopeAction(token, scope.id, scope.is_active ? "disable" : "enable");
      alerts.showSuccess("Access scope updated", `Scope ${scope.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Action could not be completed.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={USERS_ACCESS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Access scopes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Which employees, departments, and locations a role or user can access</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> Scope</Button> : null}
          </div>

          <Input className="h-8 w-64 text-xs" placeholder="Search scopes..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((s) => {
                const owner = s.scope_owner_type === "ROLE" ? s.role_name : s.scope_owner_type === "USER" ? `${s.user_name ?? "User"}${s.user_email ? ` (${s.user_email})` : ""}` : s.role_mapping_name ?? "Role mapping rule";
                return (
                  <Panel key={s.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{s.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{s.description ?? "No description"} · Owner: {owner} · {s.module_key ?? "All scoped modules"}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{SCOPE_TYPE_LABELS[s.scope_type]}{s.can_view ? " · View" : ""}{s.can_manage ? " · Manage" : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: s.is_active ? "#EAF3DE" : "#FCEBEB", color: s.is_active ? "#27500A" : "#A32D2D" }}>{s.is_active ? "Active" : "Inactive"}</span>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setModal({ mode: "edit", scope: s })}>Edit</Button>
                        <Button size="sm" variant={s.is_active ? "danger" : "primary"} onClick={() => void toggleActive(s)}>{s.is_active ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No access scopes found" description="Create role or user scopes to limit employee data by department, location, team, or company." /></Panel>
          )}
        </div>
      </div>

      {modal ? <ScopeFormModal mode={modal.mode} scope={modal.scope} roles={roles} users={users} roleMappings={roleMappings} departments={departments} locations={locations} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function ScopeFormModal({ mode, scope, roles, users, roleMappings, departments, locations, onClose, onSaved }: { mode: "create" | "edit"; scope?: AccessScopeRule; roles: Role[]; users: AccessUser[]; roleMappings: RoleMappingRule[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [name, setName] = useState(scope?.name ?? "");
  const [description, setDescription] = useState(scope?.description ?? "");
  const [ownerType, setOwnerType] = useState(scope?.scope_owner_type ?? "ROLE");
  const [roleId, setRoleId] = useState(scope?.role_id ?? "");
  const [userId, setUserId] = useState(scope?.user_id ?? "");
  const [roleMappingRuleId, setRoleMappingRuleId] = useState(scope?.role_mapping_rule_id ?? "");
  const [moduleKey, setModuleKey] = useState(scope?.module_key ?? "");
  const [scopeType, setScopeType] = useState<AccessScopeType>(scope?.scope_type ?? "OWN_DEPARTMENT");
  const [departmentIds, setDepartmentIds] = useState<string[]>(scope?.allowed_department_ids ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(scope?.allowed_location_ids ?? []);
  const [canView, setCanView] = useState(scope?.can_view ?? true);
  const [canManage, setCanManage] = useState(scope?.can_manage ?? false);
  const [isActive, setIsActive] = useState(scope?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeRoleMappings = roleMappings.filter((m) => m.is_active || m.id === roleMappingRuleId);

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }

  async function submit() {
    if (!token) return;
    setError(null);
    if (!name.trim()) return setError("Scope name is required.");
    if (ownerType === "ROLE" && !roleId) return setError("Select a role owner.");
    if (ownerType === "USER" && !userId) return setError("Select a user owner.");
    if (ownerType === "ROLE_MAPPING_RULE" && !roleMappingRuleId) return setError("Select a role mapping rule.");
    if (scopeType === "SELECTED_DEPARTMENTS" && !departmentIds.length) return setError("Select at least one department.");
    if (scopeType === "SELECTED_LOCATIONS" && !locationIds.length) return setError("Select at least one location.");
    if (!canView && !canManage) return setError("Select at least view or manage access.");
    setSaving(true);
    try {
      const input = {
        name, description: description || null, scope_owner_type: ownerType, role_id: ownerType === "ROLE" ? roleId : null,
        user_id: ownerType === "USER" ? userId : null, role_mapping_rule_id: ownerType === "ROLE_MAPPING_RULE" ? roleMappingRuleId : null,
        module_key: moduleKey || null, scope_type: scopeType, allowed_department_ids: departmentIds, allowed_location_ids: locationIds,
        can_view: canView, can_manage: canManage, is_active: isActive
      };
      if (mode === "create") await api.createAccessScope(token, input);
      else if (scope) await api.updateAccessScope(token, scope.id, input);
      alerts.showSuccess("Access scope saved", "Access scope was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save access scope.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{mode === "create" ? "Create access scope" : "Edit access scope"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Scope name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Owner type</Label><SelectField value={ownerType} onValueChange={(v) => setOwnerType(v as typeof ownerType)}><option value="ROLE">Role template</option><option value="USER">User override</option><option value="ROLE_MAPPING_RULE">Role mapping rule</option></SelectField></div>
            {ownerType === "ROLE" ? <div className="space-y-1.5"><Label>Role</Label><SelectField value={roleId ?? ""} onValueChange={setRoleId}><option value="">Select role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField></div> : null}
            {ownerType === "USER" ? <div className="space-y-1.5"><Label>User</Label><SelectField value={userId ?? ""} onValueChange={setUserId}><option value="">Select user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</SelectField></div> : null}
            {ownerType === "ROLE_MAPPING_RULE" ? <div className="space-y-1.5"><Label>Role mapping rule</Label><SelectField value={roleMappingRuleId ?? ""} onValueChange={setRoleMappingRuleId}><option value="">Select mapping</option>{activeRoleMappings.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.role_name}</option>)}</SelectField></div> : null}
            <div className="space-y-1.5"><Label>Module</Label><SelectField value={moduleKey ?? ""} onValueChange={setModuleKey}><option value="">All scoped modules</option>{ACCESS_SCOPE_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Scope type</Label><SelectField value={scopeType} onValueChange={(v) => setScopeType(v as AccessScopeType)}>{Object.entries(SCOPE_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</SelectField></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>

          {scopeType === "SELECTED_DEPARTMENTS" ? (
            <div className="mt-3 rounded-md border">
              <p className="border-b bg-[#F7F7FB] px-3 py-2 text-xs font-medium text-slate-950">Allowed departments</p>
              <div className="grid max-h-40 grid-cols-2 gap-0 overflow-y-auto">{departments.map((d) => <div key={d.id} className="border-b px-3 py-1.5"><CheckboxField label={d.name} checked={departmentIds.includes(d.id)} onChange={() => toggle(departmentIds, d.id, setDepartmentIds)} /></div>)}</div>
            </div>
          ) : null}
          {scopeType === "SELECTED_LOCATIONS" ? (
            <div className="mt-3 rounded-md border">
              <p className="border-b bg-[#F7F7FB] px-3 py-2 text-xs font-medium text-slate-950">Allowed locations</p>
              <div className="grid max-h-40 grid-cols-2 gap-0 overflow-y-auto">{locations.map((l) => <div key={l.id} className="border-b px-3 py-1.5"><CheckboxField label={l.name} checked={locationIds.includes(l.id)} onChange={() => toggle(locationIds, l.id, setLocationIds)} /></div>)}</div>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <CheckboxField label="Can view scoped records" checked={canView} onChange={setCanView} />
            <CheckboxField label="Can manage scoped records" checked={canManage} onChange={setCanManage} />
            <CheckboxField label="Active" checked={isActive} onChange={setIsActive} />
          </div>
          {scopeType === "WHOLE_COMPANY" ? <p className="mt-2 rounded-md bg-[#FAEEDA] p-2.5 text-xs text-[#854F0B]">Whole-company access should be reserved for Owner/Super Admin or tightly controlled access templates.</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Save scope</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
