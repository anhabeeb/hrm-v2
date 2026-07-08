import { useEffect, useState } from "react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { USERS_ACCESS_NAV_ITEMS } from "./usersAccessNav";
import type { Permission } from "../types/auth";

export function UsersAccessPermissionsPage() {
  const { token } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");

  useEffect(() => {
    if (!token) return;
    api.listPermissions(token).then((res) => setPermissions(res.permissions)).finally(() => setLoading(false));
  }, [token]);

  const modules = Array.from(new Set(permissions.map((p) => p.module)));
  const filtered = permissions.filter((p) => {
    const matchesSearch = !search || [p.key, p.description].some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchesModule = !module || p.module === module;
    return matchesSearch && matchesModule;
  });

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={USERS_ACCESS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Permissions</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Reference registry of every permission key in the system</p>
          </div>

          <div className="flex items-center gap-2">
            <Input className="h-8 w-64 text-xs" placeholder="Search permissions..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <SelectField value={module} onValueChange={setModule} className="h-8 w-48 text-xs">
              <option value="">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </SelectField>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((p) => (
                <Panel key={p.key} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-medium text-slate-950">{p.key}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{p.description ?? "No description"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] text-muted-foreground">{p.module}</span>
                  {p.is_critical ? <span className="shrink-0 rounded-full bg-[#FAEEDA] px-2.5 py-1 text-[10px] font-medium text-[#854F0B]">Critical</span> : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No permissions found" description="Adjust filters to view the registry." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
