import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import type { AuditLogRow } from "../../types/assets";
import type { Employee } from "../../types/employees";

export function EmployeeAuditPanel({ employee, initialAudit = [] }: { employee: Employee; initialAudit?: Record<string, unknown>[] }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canExport = permissions.has("audit.export");
  const [rows, setRows] = useState<AuditLogRow[]>(initialAudit as unknown as AuditLogRow[]);
  const [filters, setFilters] = useState({ search: "", module: "", action: "", date_from: "", date_to: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      setRows((await api.listEmployeeAuditLogs(token, employee.id, filters)).audit ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load audit timeline.");
    }
  }

  useEffect(() => {
    void load();
  }, [token, employee.id]);

  async function exportCsv() {
    if (!token) return;
    try {
      const file = await api.exportEmployeeAuditCsv(token, employee.id, filters);
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export audit timeline.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Employee audit timeline</h3>
          <p className="text-xs text-muted-foreground">Unified timeline across Employee 360, documents, leave, attendance, roster, payroll, assets, and notes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-52" placeholder="Search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Input className="w-36" placeholder="Module" value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })} />
          <Input className="w-36" placeholder="Action" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} />
          <Input className="w-36" type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
          <Input className="w-36" type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
          <Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>
          {canExport ? <Button variant="outline" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button> : null}
        </div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Module</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.created_at}</TableCell>
                  <TableCell><Badge tone="neutral">{row.module}</Badge></TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.entity_type}<div className="text-xs text-muted-foreground">{row.entity_id ?? "-"}</div></TableCell>
                  <TableCell>{row.actor_name ?? row.actor_email ?? "-"}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{row.reason ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length ? <EmptyState title="No audit activity" description="Employee-related changes will appear here." /> : null}
        </div>
      </Panel>
    </div>
  );
}
