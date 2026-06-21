import { Download, RefreshCw, Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type Row = Record<string, unknown>;
type Option = { id: string; label: string };

const reportOptions = [
  { key: "employees", label: "Employees" },
  { key: "documents", label: "Documents" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "payroll", label: "Payroll" },
  { key: "roster", label: "Roster" },
  { key: "assets", label: "Assets" },
  { key: "audit", label: "Audit" }
];

const statusColumns = new Set(["status", "display_status", "stored_status", "period_status", "module", "condition_status", "item_status"]);

const initialFilters = {
  search: "",
  date_from: "",
  date_to: "",
  department_id: "",
  position_id: "",
  location_id: "",
  employee_type: "",
  employment_type: "",
  status: "",
  document_type_id: "",
  category_id: "",
  sensitive: "",
  source: "",
  missed_punch: "",
  late_only: "",
  early_checkout_only: "",
  payroll_impact: "",
  leave_type_id: "",
  pending_my_approval: "",
  payroll_period_id: "",
  payroll_run_id: "",
  week_start_date: "",
  shift_template_id: "",
  item_status: "",
  condition_status: "",
  module: "",
  action: "",
  entity_type: "",
  actor_user_id: ""
};

type FilterState = typeof initialFilters;

export function ReportsPage() {
  const { token } = useAuth();
  const [selected, setSelected] = useState("employees");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [report, setReport] = useState<{ label: string; columns: string[]; rows: Row[] } | null>(null);
  const [available, setAvailable] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [positions, setPositions] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Option[]>([]);
  const [documentCategories, setDocumentCategories] = useState<Option[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<Option[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<Option[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<Option[]>([]);
  const [assetCategories, setAssetCategories] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta = available.find((item) => item.key === selected);
  const canExport = Boolean(selectedMeta?.can_export);

  const activeFilters = useMemo(() => {
    const output: Record<string, string> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value) output[key] = value;
    });
    return output;
  }, [filters]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReport(token, selected, activeFilters);
      setReport(result.report);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    api.getReportCenter(token)
      .then((data) => {
        setAvailable(data.reports);
        const first = data.reports.find((item) => item.can_view);
        if (first?.key) setSelected(String(first.key));
      })
      .catch(() => setAvailable([]));

    Promise.allSettled([
      api.listDepartments(token),
      api.listPositions(token),
      api.listLocations(token),
      api.listDocumentTypes(token),
      api.listDocumentCategories(token),
      api.listLeaveTypes(token),
      api.listPayrollPeriods(token),
      api.listShiftTemplates(token),
      api.listAssetCategories(token),
      api.listUsers(token)
    ]).then((results) => {
      const [departmentResult, positionResult, locationResult, documentTypeResult, documentCategoryResult, leaveTypeResult, payrollPeriodResult, shiftTemplateResult, assetCategoryResult, userResult] = results;
      if (departmentResult.status === "fulfilled") setDepartments(departmentResult.value.departments.map((item) => ({ id: item.id, label: item.name })));
      if (positionResult.status === "fulfilled") setPositions(positionResult.value.positions.map((item) => ({ id: item.id, label: item.title })));
      if (locationResult.status === "fulfilled") setLocations(locationResult.value.locations.map((item) => ({ id: item.id, label: item.name })));
      if (documentTypeResult.status === "fulfilled") setDocumentTypes(documentTypeResult.value.document_types.map((item) => ({ id: item.id, label: item.name })));
      if (documentCategoryResult.status === "fulfilled") setDocumentCategories(documentCategoryResult.value.categories.map((item) => ({ id: item.id, label: item.name })));
      if (leaveTypeResult.status === "fulfilled") setLeaveTypes(leaveTypeResult.value.leave_types.map((item) => ({ id: item.id, label: item.name })));
      if (payrollPeriodResult.status === "fulfilled") setPayrollPeriods(payrollPeriodResult.value.periods.map((item) => ({ id: item.id, label: `${String(item.period_month).padStart(2, "0")}/${item.period_year}` })));
      if (shiftTemplateResult.status === "fulfilled") setShiftTemplates(shiftTemplateResult.value.shift_templates.map((item) => ({ id: item.id, label: item.name })));
      if (assetCategoryResult.status === "fulfilled") setAssetCategories(assetCategoryResult.value.categories.map((item) => ({ id: item.id, label: item.name })));
      if (userResult.status === "fulfilled") setUsers(userResult.value.users.map((item) => ({ id: item.id, label: item.name })));
    });
  }, [token]);

  useEffect(() => {
    if (available.length) void load();
  }, [token, selected]);

  async function exportCsv() {
    if (!token || !canExport) return;
    try {
      const download = await api.exportReportCsv(token, selected, activeFilters);
      const url = URL.createObjectURL(download.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = download.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  const visibleReports = reportOptions.filter((option) => available.some((item) => item.key === option.key && item.can_view));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Report Center</h1>
          <p className="text-sm text-muted-foreground">Cross-module reports with shared filters and permission-safe CSV exports.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Run
          </Button>
          {canExport ? (
            <Button size="sm" onClick={() => void exportCsv()} disabled={!report?.rows.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : (
            <Button size="sm" disabled title="Export permission is required.">
              <Download className="h-4 w-4" />
              Export unavailable
            </Button>
          )}
        </div>
      </div>

      <Panel className="p-3">
        <div className="grid gap-2 lg:grid-cols-4 xl:grid-cols-6">
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {visibleReports.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employee, record, action..." value={filters.search} onChange={(event) => setFilter(setFilters, "search", event.target.value)} />
          </div>
          <Input type="date" value={filters.date_from} onChange={(event) => setFilter(setFilters, "date_from", event.target.value)} />
          <Input type="date" value={filters.date_to} onChange={(event) => setFilter(setFilters, "date_to", event.target.value)} />
          <Input placeholder="Status" value={filters.status} onChange={(event) => setFilter(setFilters, "status", event.target.value)} />
          <SelectFilter label="Department" value={filters.department_id} options={departments} onChange={(value) => setFilter(setFilters, "department_id", value)} />
          <SelectFilter label="Position" value={filters.position_id} options={positions} onChange={(value) => setFilter(setFilters, "position_id", value)} />
          <SelectFilter label="Outlet/location" value={filters.location_id} options={locations} onChange={(value) => setFilter(setFilters, "location_id", value)} />
          <SelectStatic label="Employee type" value={filters.employee_type} options={["LOCAL", "FOREIGN", "OTHER"]} onChange={(value) => setFilter(setFilters, "employee_type", value)} />
          <SelectStatic label="Employment type" value={filters.employment_type} options={["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]} onChange={(value) => setFilter(setFilters, "employment_type", value)} />
          {selected === "documents" ? (
            <>
              <SelectFilter label="Document type" value={filters.document_type_id} options={documentTypes} onChange={(value) => setFilter(setFilters, "document_type_id", value)} />
              <SelectFilter label="Category" value={filters.category_id} options={documentCategories} onChange={(value) => setFilter(setFilters, "category_id", value)} />
              <SelectStatic label="Sensitive" value={filters.sensitive} options={["true", "false"]} onChange={(value) => setFilter(setFilters, "sensitive", value)} />
            </>
          ) : null}
          {selected === "attendance" ? (
            <>
              <SelectStatic label="Source" value={filters.source} options={["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"]} onChange={(value) => setFilter(setFilters, "source", value)} />
              <SelectStatic label="Missed punch" value={filters.missed_punch} options={["true"]} onChange={(value) => setFilter(setFilters, "missed_punch", value)} />
              <SelectStatic label="Late only" value={filters.late_only} options={["true"]} onChange={(value) => setFilter(setFilters, "late_only", value)} />
              <SelectStatic label="Early checkout" value={filters.early_checkout_only} options={["true"]} onChange={(value) => setFilter(setFilters, "early_checkout_only", value)} />
              <SelectStatic label="Payroll impact" value={filters.payroll_impact} options={["true"]} onChange={(value) => setFilter(setFilters, "payroll_impact", value)} />
            </>
          ) : null}
          {selected === "leave" ? (
            <>
              <SelectFilter label="Leave type" value={filters.leave_type_id} options={leaveTypes} onChange={(value) => setFilter(setFilters, "leave_type_id", value)} />
              <SelectStatic label="Pending my approval" value={filters.pending_my_approval} options={["true"]} onChange={(value) => setFilter(setFilters, "pending_my_approval", value)} />
            </>
          ) : null}
          {selected === "payroll" ? (
            <>
              <SelectFilter label="Payroll period" value={filters.payroll_period_id} options={payrollPeriods} onChange={(value) => setFilter(setFilters, "payroll_period_id", value)} />
              <Input placeholder="Payroll run id" value={filters.payroll_run_id} onChange={(event) => setFilter(setFilters, "payroll_run_id", event.target.value)} />
            </>
          ) : null}
          {selected === "roster" ? (
            <>
              <Input type="date" value={filters.week_start_date} onChange={(event) => setFilter(setFilters, "week_start_date", event.target.value)} />
              <SelectFilter label="Shift" value={filters.shift_template_id} options={shiftTemplates} onChange={(value) => setFilter(setFilters, "shift_template_id", value)} />
            </>
          ) : null}
          {selected === "assets" ? (
            <>
              <SelectFilter label="Asset category" value={filters.category_id} options={assetCategories} onChange={(value) => setFilter(setFilters, "category_id", value)} />
              <SelectStatic label="Item status" value={filters.item_status} options={["AVAILABLE", "ISSUED", "DAMAGED", "LOST", "WRITTEN_OFF", "ARCHIVED"]} onChange={(value) => setFilter(setFilters, "item_status", value)} />
              <SelectStatic label="Condition" value={filters.condition_status} options={["NEW", "GOOD", "FAIR", "DAMAGED", "LOST", "WRITTEN_OFF"]} onChange={(value) => setFilter(setFilters, "condition_status", value)} />
            </>
          ) : null}
          {selected === "audit" ? (
            <>
              <Input placeholder="Module" value={filters.module} onChange={(event) => setFilter(setFilters, "module", event.target.value)} />
              <Input placeholder="Action" value={filters.action} onChange={(event) => setFilter(setFilters, "action", event.target.value)} />
              <Input placeholder="Entity type" value={filters.entity_type} onChange={(event) => setFilter(setFilters, "entity_type", event.target.value)} />
              <SelectFilter label="Actor" value={filters.actor_user_id} options={users} onChange={(value) => setFilter(setFilters, "actor_user_id", value)} />
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setFilters(initialFilters)}>Reset</Button>
          <Button variant="outline" size="sm" onClick={() => void load()}>Apply</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{report?.label ?? "Report results"}</h2>
          <p className="text-xs text-muted-foreground">Showing up to 500 rows. Export uses these exact filters.</p>
        </div>
        <DataTableFrame loading={loading} error={error} empty={!loading && !error && !report?.rows.length}>
          <Table>
            <TableHeader className="sticky top-0">
              <TableRow>{(report?.columns ?? []).map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {(report?.rows ?? []).map((row, index) => (
                <TableRow key={String(row.id ?? index)}>
                  {(report?.columns ?? []).map((column) => (
                    <TableCell key={column} className="whitespace-nowrap">
                      {statusColumns.has(column) ? <StatusBadge value={row[column]} /> : String(row[column] ?? "-")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
    </div>
  );
}

function setFilter(setFilters: Dispatch<SetStateAction<FilterState>>, key: keyof FilterState, value: string) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <select className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} title={label}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  );
}

function SelectStatic({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <select className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} title={label}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}
