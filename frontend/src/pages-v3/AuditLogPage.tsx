import { useEffect, useState } from "react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { AuditLogRow } from "../types/assets";

function text(value: unknown, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export function AuditLogPage() {
  const { token, user } = useAuth();
  const canView = user?.permissions.includes("audit.view");
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    const res = await api.listAuditLogs(token, { search, module }).catch(() => ({ audit: [] }));
    setRows(res.audit ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token, canView, search, module]);

  const modules = Array.from(new Set(rows.map((r) => r.module).filter(Boolean)));

  if (!canView) return <PageShell><Panel><EmptyState title="Audit unavailable" description="Your account needs audit.view permission." /></Panel></PageShell>;

  return (
    <PageShell constrained={false}>
      <div>
        <p className="text-lg font-medium text-slate-950">Audit log</p>
        <p className="mt-0.5 text-xs text-muted-foreground">System-wide audit trail with module, action, actor, and entity detail</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input className="h-8 w-64 text-xs" placeholder="Search audit log..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectField value={module} onValueChange={setModule} className="h-8 w-48 text-xs">
          <option value="">All modules</option>
          {modules.map((m) => <option key={String(m)} value={String(m)}>{String(m)}</option>)}
        </SelectField>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
      ) : rows.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <Panel key={row.id} className="flex items-center gap-3.5 p-3">
              <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{text(row.module)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-950">{text(row.action)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.entity_type)} {row.entity_id ? `· ${text(row.entity_id)}` : ""} · {text(row.actor_name ?? row.actor_email, "System")}{row.reason ? ` · ${text(row.reason)}` : ""}</p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{text(row.created_at)}</span>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="mt-3"><EmptyState title="No audit entries" description="System activity will appear here." /></Panel>
      )}
    </PageShell>
  );
}
