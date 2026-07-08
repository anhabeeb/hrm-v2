import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, CheckboxField } from "../components/ui/page-shell";
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
import type { Permission, Role } from "../types/auth";

export function UsersAccessRolesPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "permissions"; role?: Role } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    const [roleResult, permissionResult] = await Promise.all([api.listRoles(token), api.listPermissions(token)]);
    setRoles(roleResult.roles);
    setPermissions(permissionResult.permissions);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = roles.filter((r) => !search || [r.name, r.description].some((v) => v?.toLowerCase().includes(search.toLowerCase())));

  async function toggleActive(role: Role) {
    if (!token || role.is_protected) return;
    try {
      await api.roleAction(token, role.id, role.is_active ? "disable" : "enable");
      alerts.showSuccess("Role updated", `Role ${role.is_active ? "disabled" : "enabled"}.`);
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
              <p className="text-lg font-medium text-slate-950">Roles</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Role templates and their assigned permissions</p>
            </div>
            <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> Role</Button>
          </div>

          <Input className="h-8 w-64 text-xs" placeholder="Search roles..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((role) => (
                <Panel key={role.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{role.name}{role.is_system_role ? <span className="ml-1.5 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[9px] text-[#0C447C]">System</span> : null}{role.is_protected ? <span className="ml-1.5 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[9px] text-[#854F0B]">Protected</span> : null}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{role.description ?? "No description"} · {role.permission_count} permissions · {role.user_count} users</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: role.is_active ? "#EAF3DE" : "#FCEBEB", color: role.is_active ? "#27500A" : "#A32D2D" }}>{role.is_active ? "Active" : "Inactive"}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setModal({ mode: "edit", role })}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => setModal({ mode: "permissions", role })}>Permissions</Button>
                    <Button size="sm" variant={role.is_active ? "danger" : "primary"} disabled={role.is_protected && role.is_active} onClick={() => void toggleActive(role)}>{role.is_active ? "Disable" : "Enable"}</Button>
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No roles found" description="Create a role template to assign permissions." /></Panel>
          )}
        </div>
      </div>

      {modal ? <RoleFormModal mode={modal.mode} role={modal.role} permissions={permissions} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function RoleFormModal({ mode, role, permissions, onClose, onSaved }: { mode: "create" | "edit" | "permissions"; role?: Role; permissions: Permission[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [isActive, setIsActive] = useState(role?.is_active ?? true);
  const [permissionKeys, setPermissionKeys] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const permissionMode = mode === "permissions";

  const grouped = permissions.reduce<Record<string, Permission[]>>((groups, p) => {
    groups[p.module] = groups[p.module] ?? [];
    groups[p.module].push(p);
    return groups;
  }, {});

  function togglePermission(permission: Permission) {
    if (role?.is_protected && permission.is_critical) return;
    setPermissionKeys((current) => current.includes(permission.key) ? current.filter((k) => k !== permission.key) : [...current, permission.key]);
  }

  async function submit() {
    if (!token) return;
    setError(null);
    if (permissionMode) {
      if (!role) return;
      setSaving(true);
      try {
        await api.setRolePermissions(token, role.id, permissionKeys);
        alerts.showSuccess("Permissions saved", "Role permissions were updated.");
        onSaved();
      } catch (err) {
        alerts.showApiError(err, "Unable to save permissions.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!name.trim()) return setError("Role name is required.");
    setSaving(true);
    try {
      if (mode === "create") await api.createRole(token, { name, description });
      else if (role) await api.updateRole(token, role.id, { name, description, is_active: role.is_protected ? true : isActive });
      alerts.showSuccess("Role saved", "Role was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size={permissionMode ? "xl" : "md"}>
        <DialogHeader><DialogTitle>{mode === "create" ? "Create role" : permissionMode ? `${role?.name} permissions` : "Edit role"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          {!permissionMode ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Role name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Active</Label><CheckboxField label="Active" checked={isActive} disabled={role?.is_protected} onChange={setIsActive} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
          ) : (
            <div className="space-y-3">
              {role?.is_protected ? <p className="rounded-md bg-[#FAEEDA] p-2.5 text-xs text-[#854F0B]">Critical Owner permissions cannot be removed.</p> : null}
              <div className="grid max-h-[60vh] gap-3 overflow-y-auto md:grid-cols-2">
                {Object.entries(grouped).map(([module, modulePermissions]) => (
                  <div key={module} className="rounded-md border">
                    <p className="border-b bg-[#F7F7FB] px-3 py-2 text-xs font-medium text-slate-950">{module}</p>
                    <div className="divide-y">
                      {modulePermissions.map((permission) => {
                        const locked = Boolean(role?.is_protected && permission.is_critical);
                        return (
                          <div key={permission.key} className="px-3 py-2">
                            <CheckboxField
                              checked={permissionKeys.includes(permission.key) || locked}
                              disabled={locked}
                              onChange={() => togglePermission(permission)}
                              label={<span><span className="font-mono text-[11px]">{permission.key}</span>{permission.is_critical ? <span className="ml-1.5 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[9px] text-[#854F0B]">Critical</span> : null}<span className="block text-[10px] text-muted-foreground">{permission.description}</span></span>}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>{permissionMode ? "Save permissions" : "Save role"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
