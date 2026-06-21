import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AuditLogRow } from "../types/assets";

export function AuditLogPage() {
  const { token, user } = useAuth();
  const canView = user?.permissions.includes("audit.view");
  const canExport = user?.permissions.includes("audit.export");
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [filters, setFilters] = useState({ search: "", module: "", action: "", entity_type: "", date_from: "", date_to: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token || !canView) return;
    try {
      setRows((await api.listAuditLogs(token, filters)).audit ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load audit log.");
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function exportCsv() {
    if (!token) return;
    try {
      const file = await api.exportAuditLogsCsv(token, filters);
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export audit log.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Audit unavailable" description="Your account needs audit.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Audit Log</h1><p className="text-sm text-muted-foreground">System-wide audit trail with module, action, actor, date, and entity filters.</p></div>
      <Panel className="flex flex-wrap gap-2 p-4"><Input className="w-56" placeholder="Search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><Input className="w-36" placeholder="Module" value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })} /><Input className="w-40" placeholder="Action" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /><Input className="w-40" placeholder="Entity type" value={filters.entity_type} onChange={(event) => setFilters({ ...filters, entity_type: event.target.value })} /><Input className="w-40" type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /><Input className="w-40" type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>{canExport ? <Button variant="outline" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button> : null}</Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Module</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead><TableHead>IP</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.created_at}</TableCell><TableCell><Badge tone="neutral">{row.module}</Badge></TableCell><TableCell>{row.action}</TableCell><TableCell>{row.entity_type}<div className="text-xs text-muted-foreground">{row.entity_id ?? "-"}</div></TableCell><TableCell>{row.actor_name ?? row.actor_email ?? "-"}</TableCell><TableCell className="max-w-[320px] truncate">{row.reason ?? "-"}</TableCell><TableCell>{row.ip_address ?? "-"}</TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <EmptyState title="No audit entries" description="System activity will appear here." /> : null}</div></Panel>
    </div>
  );
}
