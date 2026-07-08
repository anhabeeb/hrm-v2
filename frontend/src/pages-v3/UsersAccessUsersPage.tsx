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
import type { AccessUser, Role, UserStatus } from "../types/auth";

function statusTone(status: UserStatus) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "LOCKED") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#FCEBEB", text: "#A32D2D" };
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function UsersAccessUsersPage() {
  const { token, user: currentUser } = useAuth();
  const alerts = useAlert();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "assign"; user?: AccessUser } | null>(null);

  const activeOwnerCount = users.filter((u) => u.is_owner && u.status === "ACTIVE").length;
  const ownerRole = roles.find((r) => r.is_owner_role);

  async function load() {
    if (!token) return;
    setLoading(true);
    const [userResult, roleResult] = await Promise.all([api.listUsers(token), api.listRoles(token)]);
    setUsers(userResult.users);
    setRoles(roleResult.roles);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = users.filter((u) => !search || [u.name, u.email, u.username].some((v) => v?.toLowerCase().includes(search.toLowerCase())));

  async function statusAction(user: AccessUser, action: "enable" | "disable" | "lock" | "unlock") {
    if (!token) return;
    try {
      await api.userAction(token, user.id, action);
      alerts.showSuccess("User updated", `${action} action completed.`);
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
              <p className="text-lg font-medium text-slate-950">Users</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Manage system users and their assigned roles</p>
            </div>
            <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> User</Button>
          </div>

          <Input className="h-8 w-64 text-xs" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((u) => {
                const lastOwner = u.is_owner && u.status === "ACTIVE" && activeOwnerCount <= 1;
                return (
                  <Panel key={u.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{u.name}{u.is_owner ? <span className="ml-1.5 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[9px] font-medium text-[#0C447C]">Protected</span> : null}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{u.email}{u.username ? ` · ${u.username}` : ""}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Roles: {u.roles.length ? u.roles.join(", ") : "None"} · Last login {formatDate(u.last_login_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(u.status).bg, color: statusTone(u.status).text }}>{u.status}</span>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setModal({ mode: "edit", user: u })}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setModal({ mode: "assign", user: u })}>Roles</Button>
                      {u.status === "ACTIVE" ? (
                        <Button size="sm" variant="danger" disabled={lastOwner} onClick={() => void statusAction(u, "disable")}>Disable</Button>
                      ) : (
                        <Button size="sm" onClick={() => void statusAction(u, "enable")}>Enable</Button>
                      )}
                      {u.status === "LOCKED" ? (
                        <Button size="sm" onClick={() => void statusAction(u, "unlock")}>Unlock</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={lastOwner} onClick={() => void statusAction(u, "lock")}>Lock</Button>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No users found" description="Adjust filters or create a user." /></Panel>
          )}
        </div>
      </div>

      {modal ? (
        <UserFormModal
          mode={modal.mode}
          user={modal.user}
          roles={roles}
          ownerRole={ownerRole}
          activeOwnerCount={activeOwnerCount}
          currentUserName={currentUser?.name}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void load(); }}
        />
      ) : null}
    </PageShell>
  );
}

function UserFormModal({ mode, user, roles, ownerRole, activeOwnerCount, onClose, onSaved }: { mode: "create" | "edit" | "assign"; user?: AccessUser; roles: Role[]; ownerRole?: Role; activeOwnerCount: number; currentUserName?: string; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "ACTIVE");
  const [roleIds, setRoleIds] = useState<string[]>(user?.role_ids ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const assignOnly = mode === "assign";
  const isCreate = mode === "create";
  const lastOwner = user?.is_owner && user.status === "ACTIVE" && activeOwnerCount <= 1;

  function toggleRole(role: Role) {
    if (!role.is_active) return;
    const next = roleIds.includes(role.id) ? roleIds.filter((id) => id !== role.id) : [...roleIds, role.id];
    if (lastOwner && ownerRole && !next.includes(ownerRole.id)) {
      setError("The last active Owner user cannot lose the Owner role.");
      return;
    }
    setError(null);
    setRoleIds(next);
  }

  async function submit() {
    if (!token) return;
    setError(null);
    if (!assignOnly && !name.trim()) return setError("Name is required.");
    if (!assignOnly && !email.includes("@")) return setError("A valid email address is required.");
    if (isCreate && password.length < 12) return setError("Password must be at least 12 characters.");
    setSaving(true);
    try {
      if (isCreate) await api.createUser(token, { name, email, username, password, status, role_ids: roleIds });
      else if (assignOnly && user) await api.assignUserRoles(token, user.id, roleIds);
      else if (user) await api.updateUser(token, user.id, { name, email, username, role_ids: roleIds });
      alerts.showSuccess("User saved", "User was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{isCreate ? "Create user" : assignOnly ? "Assign roles" : "Edit user"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          {!assignOnly ? (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Username</Label><Input value={username ?? ""} onChange={(e) => setUsername(e.target.value)} /></div>
              {isCreate ? <div className="space-y-1.5"><Label>Status</Label><SelectField value={status} onValueChange={(v) => setStatus(v as UserStatus)}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="LOCKED">Locked</option></SelectField></div> : null}
              {isCreate ? <div className="space-y-1.5"><Label>Password</Label><Input type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></div> : null}
            </div>
          ) : null}
          <Label>Roles</Label>
          <div className="mt-1.5 max-h-60 overflow-y-auto rounded-md border">
            {roles.map((role) => (
              <div key={role.id} className="border-b px-3 py-2 last:border-b-0">
                <CheckboxField
                  checked={roleIds.includes(role.id)}
                  disabled={!role.is_active || Boolean(lastOwner && ownerRole?.id === role.id)}
                  onChange={() => toggleRole(role)}
                  label={<span><span className="font-medium">{role.name}</span>{role.is_protected ? <span className="ml-1.5 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[9px] text-[#854F0B]">Protected</span> : null}<span className="block text-[10px] text-muted-foreground">{role.description ?? "No description"}</span></span>}
                />
              </div>
            ))}
          </div>
          {lastOwner ? <p className="mt-2 text-[10px] text-[#854F0B]">Last active Owner protections are locked.</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Save user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
