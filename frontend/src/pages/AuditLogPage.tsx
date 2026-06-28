import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput,
  type StandardDateRange
} from "../components/filters";
import { PageHeader, PageShell } from "../components/ui/page-shell";
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
  const dateRange: StandardDateRange = { from: filters.date_from, to: filters.date_to };

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

  function setDateRange(range: StandardDateRange) {
    setFilters((current) => ({ ...current, date_from: range.from ?? "", date_to: range.to ?? "" }));
  }

  function resetFilters() {
    setFilters({ search: "", module: "", action: "", entity_type: "", date_from: "", date_to: "" });
  }

  const activeChips = [
    filters.search.trim() ? { key: "search", label: "Search", value: filters.search.trim(), onRemove: () => setFilters((current) => ({ ...current, search: "" })) } : null,
    filters.module ? { key: "module", label: "Module", value: filters.module, onRemove: () => setFilters((current) => ({ ...current, module: "" })) } : null,
    filters.action ? { key: "action", label: "Action", value: filters.action, onRemove: () => setFilters((current) => ({ ...current, action: "" })) } : null,
    filters.entity_type ? { key: "entityType", label: "Entity", value: filters.entity_type, onRemove: () => setFilters((current) => ({ ...current, entity_type: "" })) } : null,
    filters.date_from || filters.date_to ? { key: "date", label: "Date", value: `${filters.date_from || "Any"} - ${filters.date_to || "Any"}`, onRemove: () => setDateRange({}) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;

  if (!canView) return <PageShell><Panel><EmptyState title="Audit unavailable" description="Your account needs audit.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader title="Audit Log" description="System-wide audit trail with module, action, actor, date, and entity filters." />
      <StandardFilterBar
        search={<StandardSearchInput value={filters.search} onDebouncedChange={(value) => setFilters((current) => ({ ...current, search: value }))} placeholder="Search audit log..." />}
        reset={<FilterResetButton onReset={resetFilters} />}
        moreFilters={
          <MoreFiltersSheet onReset={resetFilters} onApply={() => void load()}>
            <FilterSection title="Audit">
              <label className="grid gap-1.5 text-sm font-medium text-slate-800">Module<Input value={filters.module} onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value }))} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-800">Action<Input value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-800">Entity type<Input value={filters.entity_type} onChange={(event) => setFilters((current) => ({ ...current, entity_type: event.target.value }))} /></label>
            </FilterSection>
          </MoreFiltersSheet>
        }
        actions={canExport ? <Button variant="outline" className="h-10" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button> : null}
      >
        <StandardDateRangeFilter value={dateRange} onChange={setDateRange} label="Date Range" />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Module</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead><TableHead>IP</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.created_at}</TableCell><TableCell><Badge tone="neutral">{row.module}</Badge></TableCell><TableCell>{row.action}</TableCell><TableCell>{row.entity_type}<div className="text-xs text-muted-foreground">{row.entity_id ?? "-"}</div></TableCell><TableCell>{row.actor_name ?? row.actor_email ?? "-"}</TableCell><TableCell className="max-w-[320px] truncate">{row.reason ?? "-"}</TableCell><TableCell>{row.ip_address ?? "-"}</TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <EmptyState title="No audit entries" description="System activity will appear here." /> : null}</div></Panel>
    </PageShell>
  );
}
