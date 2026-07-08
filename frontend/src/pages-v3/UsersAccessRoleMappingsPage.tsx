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
import type { AccessScopeType, Role, RoleMappingRule } from "../types/auth";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const SCOPE_TYPE_LABELS: Record<AccessScopeType, string> = {
  SELF_ONLY: "Self only", OWN_TEAM: "Own team", OWN_DEPARTMENT: "Own department", SELECTED_DEPARTMENTS: "Selected departments",
  OWN_LOCATION: "Own location", SELECTED_LOCATIONS: "Selected locations", ALL_LOCATIONS: "All locations", WHOLE_COMPANY: "Whole company"
};

export function UsersAccessRoleMappingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [mappings, setMappings] = useState<RoleMappingRule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; mapping?: RoleMappingRule } | null>(null);

  const canManage = Boolean(user?.permissions.includes("role_mappings.manage"));

  async function load() {
    if (!token) return;
    setLoading(true);
    const [mappingResult, roleResult, departmentResult, locationResult] = await Promise.all([
      api.listRoleMappings(token), api.listRoles(token), api.listDepartments(token), api.listLocations(token)
    ]);
    setMappings(mappingResult.role_mappings);
    setRoles(roleResult.roles);
    setDepartments(departmentResult.departments);
    setLocations(locationResult.locations);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = mappings.filter((m) => !search || [m.name, m.description, m.role_name].some((v) => v?.toLowerCase().includes(search.toLowerCase())));

  async function toggleActive(mapping: RoleMappingRule) {
    if (!token) return;
    try {
      await api.roleMappingAction(token, mapping.id, mapping.is_active ? "disable" : "enable");
      alerts.showSuccess("Role mapping updated", `Mapping ${mapping.is_active ? "disabled" : "enabled"}.`);
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
              <p className="text-lg font-medium text-slate-950">Role mappings</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Templates that suggest a role and data scope for employee-linked users</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> Mapping</Button> : null}
          </div>

          <Panel className="p-3 text-[10px] text-[#0C447C]" style={{ background: "#E6F1FB" }}>
            Roles decide what the user can do. Scopes decide which employees, departments, and locations the user can access. Higher priority rules win when multiple mappings match.
          </Panel>

          <Input className="h-8 w-64 text-xs" placeholder="Search role mappings..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((m) => (
                <Panel key={m.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{m.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{m.description ?? "No description"} · Suggests {m.role_name ?? m.default_role_id} · {SCOPE_TYPE_LABELS[m.default_scope_type]} · Priority {m.priority}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{[m.employee_type, m.employment_type, m.department_name, m.position_title, m.location_name, m.job_level_name].filter(Boolean).join(" · ") || "No matching criteria (fallback)"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: m.is_active ? "#EAF3DE" : "#FCEBEB", color: m.is_active ? "#27500A" : "#A32D2D" }}>{m.is_active ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setModal({ mode: "edit", mapping: m })}>Edit</Button>
                      <Button size="sm" variant={m.is_active ? "danger" : "primary"} onClick={() => void toggleActive(m)}>{m.is_active ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No role mappings found" description="Create access templates that suggest roles and data scopes for employee-linked users." /></Panel>
          )}
        </div>
      </div>

      {modal ? <MappingFormModal mode={modal.mode} mapping={modal.mapping} roles={roles} departments={departments} locations={locations} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function MappingFormModal({ mode, mapping, roles, departments, locations, onClose, onSaved }: { mode: "create" | "edit"; mapping?: RoleMappingRule; roles: Role[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [name, setName] = useState(mapping?.name ?? "");
  const [description, setDescription] = useState(mapping?.description ?? "");
  const [defaultRoleId, setDefaultRoleId] = useState(mapping?.default_role_id ?? "");
  const [employeeType, setEmployeeType] = useState(mapping?.employee_type ?? "");
  const [employmentType, setEmploymentType] = useState(mapping?.employment_type ?? "");
  const [departmentId, setDepartmentId] = useState(mapping?.department_id ?? "");
  const [locationId, setLocationId] = useState(mapping?.location_id ?? "");
  const [scopeType, setScopeType] = useState<AccessScopeType>(mapping?.default_scope_type ?? "SELF_ONLY");
  const [departmentIds, setDepartmentIds] = useState<string[]>(mapping?.allowed_department_ids ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(mapping?.allowed_location_ids ?? []);
  const [canView, setCanView] = useState(mapping?.can_view ?? true);
  const [canManage, setCanManage] = useState(mapping?.can_manage ?? false);
  const [priority, setPriority] = useState(String(mapping?.priority ?? 100));
  const [isActive, setIsActive] = useState(mapping?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const assignableRoles = roles.filter((r) => r.is_active && !r.is_protected);

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }

  async function submit() {
    if (!token) return;
    setError(null);
    if (!name.trim()) return setError("Mapping name is required.");
    if (!defaultRoleId) return setError("Default role is required.");
    if (scopeType === "SELECTED_DEPARTMENTS" && !departmentIds.length) return setError("Select at least one allowed department.");
    if (scopeType === "SELECTED_LOCATIONS" && !locationIds.length) return setError("Select at least one allowed location.");
    setSaving(true);
    try {
      const input = {
        name, description: description || null, default_role_id: defaultRoleId, employee_type: employeeType || null, employment_type: employmentType || null,
        department_id: departmentId || null, location_id: locationId || null, default_scope_type: scopeType, allowed_department_ids: departmentIds,
        allowed_location_ids: locationIds, can_view: canView, can_manage: canManage, priority: Number(priority) || 100, is_active: isActive
      };
      if (mode === "create") await api.createRoleMapping(token, input);
      else if (mapping) await api.updateRoleMapping(token, mapping.id, input);
      alerts.showSuccess("Role mapping saved", "Role mapping was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save role mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{mode === "create" ? "Create role mapping" : "Edit role mapping"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Mapping name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Default role</Label><SelectField value={defaultRoleId} onValueChange={setDefaultRoleId}><option value="">Select role</option>{assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Employee type</Label><SelectField value={employeeType ?? ""} onValueChange={setEmployeeType}><option value="">Any</option><option value="LOCAL">Local</option><option value="FOREIGN">Foreign</option><option value="OTHER">Other</option></SelectField></div>
            <div className="space-y-1.5"><Label>Employment type</Label><SelectField value={employmentType ?? ""} onValueChange={setEmploymentType}><option value="">Any</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="INTERN">Intern</option><option value="TEMPORARY">Temporary</option><option value="CONTRACT">Contract</option></SelectField></div>
            <div className="space-y-1.5"><Label>Department</Label><SelectField value={departmentId ?? ""} onValueChange={setDepartmentId}><option value="">Any department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Location</Label><SelectField value={locationId ?? ""} onValueChange={setLocationId}><option value="">Any location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Default scope</Label><SelectField value={scopeType} onValueChange={(v) => setScopeType(v as AccessScopeType)}>{Object.entries(SCOPE_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
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
            <CheckboxField label="Can view" checked={canView} onChange={setCanView} />
            <CheckboxField label="Can manage" checked={canManage} onChange={setCanManage} />
            <CheckboxField label="Active" checked={isActive} onChange={setIsActive} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Save mapping</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
