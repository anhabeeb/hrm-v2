import { useEffect, useMemo, useState } from "react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
import { humanizeTechnicalLabel } from "../lib/displayLabels";

type Row = Record<string, unknown>;
type ReportOption = { key: string; label: string; group?: string; can_view?: boolean; can_export?: boolean };
type Mode = "reports" | "exports";

const reportGroupOrder = [
  "Payroll Reports", "Pension Reports", "Bank Loan Reports", "Custom Deduction Reports", "Final Settlement Reports",
  "Attendance / Leave / Roster Payroll Variance Reports", "Payment Register Reports", "Export History / Report Audit Logs", "Core"
];

const statusColumns = new Set(["status", "display_status", "stored_status", "period_status", "module", "condition_status", "item_status", "payment_status", "payroll_status", "settlement_status", "clearance_status", "approval_status", "warning_status"]);

export function ReportsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [mode, setMode] = useState<Mode>("reports");
  const [available, setAvailable] = useState<ReportOption[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<{ label: string; group?: string; columns: string[]; rows: Row[] } | null>(null);
  const [exportLogs, setExportLogs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedMeta = available.find((item) => item.key === selected);
  const canExport = Boolean(selectedMeta?.can_export);
  const visibleReports = useMemo(() => available.filter((item) => item.can_view), [available]);
  const groupedReports = useMemo(() => {
    const groups = new Map<string, ReportOption[]>();
    visibleReports.forEach((item) => groups.set(item.group ?? "Core", [...(groups.get(item.group ?? "Core") ?? []), item]));
    return Array.from(groups.entries()).sort((a, b) => reportGroupOrder.indexOf(a[0]) - reportGroupOrder.indexOf(b[0]));
  }, [visibleReports]);
  const activeFilters = useMemo(() => {
    const filters: Record<string, string> = {};
    if (search) filters.search = search;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    return filters;
  }, [search, dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    api.getReportCenter(token).then((data) => {
      const reports = data.reports as ReportOption[];
      setAvailable(reports);
      const first = reports.find((item) => item.can_view);
      if (first?.key) setSelected(String(first.key));
    }).catch(() => setAvailable([]));
  }, [token]);

  async function load() {
    if (!token || !selected) return;
    setLoading(true);
    try {
      setReport((await api.getReport(token, selected, activeFilters)).report as { label: string; group?: string; columns: string[]; rows: Row[] });
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadExportLogs() {
    if (!token) return;
    const data = await api.getReportExportLogs(token, { report_key: selected, date_from: dateFrom, date_to: dateTo }).catch(() => ({ logs: [] }));
    setExportLogs(data.logs);
  }

  useEffect(() => { if (selected) void load(); }, [token, selected]);
  useEffect(() => { if (mode === "exports") void loadExportLogs(); }, [mode, token, selected]);

  async function queueExport(format: "csv" | "xlsx" | "pdf") {
    if (!token || !selected || !canExport) return;
    try {
      const exportFormat = format === "xlsx" ? "EXCEL" : format === "pdf" ? "PDF" : "CSV";
      const result = await api.queueReportExport(token, selected, { ...activeFilters, export_format: exportFormat });
      alerts.showSuccess("Report export queued", result.message ?? "Track progress in the background job drawer.");
      if (mode === "exports") void loadExportLogs();
    } catch (err) {
      alerts.showApiError(err, "Unable to queue report export.");
    }
  }

  async function downloadArtifact(row: Row) {
    if (!token || !row.artifact_id) return;
    try {
      const result = await api.downloadReportArtifact(token, String(row.artifact_id));
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      alerts.showApiError(err, "Unable to download report artifact.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-medium text-slate-950">Reports</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Payroll, pension, bank loan, settlement, variance, and compliance reporting</p>
        </div>
        <div className="flex gap-1 rounded-md bg-[#F7F7FB] p-1">
          <button type="button" onClick={() => setMode("reports")} className={`rounded px-3 py-1 text-xs font-medium ${mode === "reports" ? "bg-white text-slate-950 shadow-sm" : "text-muted-foreground"}`}>Reports</button>
          <button type="button" onClick={() => setMode("exports")} className={`rounded px-3 py-1 text-xs font-medium ${mode === "exports" ? "bg-white text-slate-950 shadow-sm" : "text-muted-foreground"}`}>Export history</button>
        </div>
      </div>

      <Panel className="mt-3 flex flex-wrap items-center gap-2 p-3">
        <SelectField value={selected} onValueChange={setSelected} className="h-8 min-w-[220px] text-xs">
          {groupedReports.map(([group, reports]) => (
            <optgroup key={group} label={group}>
              {reports.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </optgroup>
          ))}
        </SelectField>
        <Input className="h-8 w-48 text-xs" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Input className="h-8 w-36 text-xs" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input className="h-8 w-36 text-xs" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => void (mode === "exports" ? loadExportLogs() : load())}>Apply</Button>
        {mode === "reports" ? (
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" disabled={!canExport} onClick={() => void queueExport("csv")}>Export CSV</Button>
            <Button size="sm" variant="outline" disabled={!canExport} onClick={() => void queueExport("xlsx")}>Export Excel</Button>
            <Button size="sm" variant="outline" disabled={!canExport} onClick={() => void queueExport("pdf")}>Export PDF</Button>
          </div>
        ) : null}
      </Panel>

      {mode === "reports" ? (
        <Panel className="mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-xs font-medium text-slate-950">{report?.label ?? "Report results"}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{report?.group ?? selectedMeta?.group ?? "Reports"} · Export uses these exact filters and is audit logged</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{report?.rows.length ?? 0} rows</span>
          </div>
          <ReportTable columns={report?.columns ?? []} rows={report?.rows ?? []} loading={loading} />
        </Panel>
      ) : (
        <Panel className="mt-3 overflow-hidden">
          <div className="border-b px-4 py-3">
            <p className="text-xs font-medium text-slate-950">Export history</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">CSV/Excel/PDF export audit logs and requester details</p>
          </div>
          <ReportTable
            columns={["requested_at", "report_key", "report_name", "export_format", "row_count", "status", "requested_by_name", "file_name", "download_url"]}
            rows={exportLogs}
            onDownloadArtifact={downloadArtifact}
          />
        </Panel>
      )}
    </PageShell>
  );
}

function ReportTable({ columns, rows, loading, onDownloadArtifact }: { columns: string[]; rows: Row[]; loading?: boolean; onDownloadArtifact?: (row: Row) => void }) {
  if (loading) return <div className="p-4"><div className="h-32 animate-pulse rounded-md bg-[#F7F7FB]" /></div>;
  if (!rows.length) return <div className="p-4"><EmptyState title="No report rows found" description="Adjust filters or run the report after source records are created." /></div>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white"><TableRow>{columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{humanizeTechnicalLabel(c)}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={String(row.id ?? i)}>
              {columns.map((column) => (
                <TableCell key={column} className="whitespace-nowrap">
                  {column === "download_url"
                    ? row.download_url ? <Button size="sm" variant="outline" onClick={() => onDownloadArtifact?.(row)}>Download</Button> : "-"
                    : statusColumns.has(column)
                      ? <span className="rounded-full bg-[#F7F7FB] px-2 py-0.5 text-[10px] text-muted-foreground">{humanizeTechnicalLabel(String(row[column] ?? "-"))}</span>
                      : String(row[column] ?? "-")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
