import { History, RefreshCw } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActionTextButton } from "../components/ui/action-button";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput
} from "../components/filters";
import { AlertBanner, ExportActionBar, PageHeader, PageShell, SelectField, StandardTabs } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

type Row = Record<string, unknown>;
type Option = { id: string; label: string };
type ReportOption = { key: string; label: string; group?: string; module?: string; can_view?: boolean; can_export?: boolean };
type Tab = "reports" | "exports";

const statusColumns = new Set(["status", "display_status", "stored_status", "period_status", "module", "condition_status", "item_status", "payment_status", "payroll_status", "settlement_status", "clearance_status", "approval_status", "warning_status", "bank_notification_status", "minimum_net_salary_protection_status", "direct_bank_collection_status", "remittance_status"]);

const initialFilters = {
  search: "",
  employee_number: "",
  date_from: "",
  date_to: "",
  department_id: "",
  position_id: "",
  location_id: "",
  employee_type: "",
  employment_type: "",
  employee_status: "",
  status: "",
  payment_status: "",
  payroll_run_status: "",
  document_type_id: "",
  category_id: "",
  sensitive: "",
  source: "",
  attendance_status: "",
  missed_punch: "",
  late_only: "",
  early_checkout_only: "",
  payroll_impact: "",
  leave_type_id: "",
  pending_my_approval: "",
  payroll_period_id: "",
  payroll_run_id: "",
  pension_scheme_id: "",
  payment_institution_id: "",
  deduction_template_id: "",
  deduction_category: "",
  final_settlement_status: "",
  week_start_date: "",
  shift_template_id: "",
  item_status: "",
  condition_status: "",
  module: "",
  action: "",
  entity_type: "",
  actor_user_id: "",
  export_format: "CSV",
  page: "1",
  limit: "100"
};

type FilterState = typeof initialFilters;

const reportGroupOrder = [
  "Payroll Reports",
  "Pension Reports",
  "Bank Loan Reports",
  "Custom Deduction Reports",
  "Final Settlement Reports",
  "Attendance / Leave / Roster Payroll Variance Reports",
  "Payment Register Reports",
  "Export History / Report Audit Logs",
  "Core"
];

export function ReportsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const [tab, setTab] = useState<Tab>("reports");
  const [selected, setSelected] = useState("");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [report, setReport] = useState<{ key: string; label: string; group?: string; columns: string[]; rows: Row[]; pagination?: Row } | null>(null);
  const [available, setAvailable] = useState<ReportOption[]>([]);
  const [exportLogs, setExportLogs] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Option[]>([]);
  const [documentCategories, setDocumentCategories] = useState<Option[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<Option[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<Option[]>([]);
  const [pensionSchemes, setPensionSchemes] = useState<Option[]>([]);
  const [paymentInstitutions, setPaymentInstitutions] = useState<Option[]>([]);
  const [deductionTemplates, setDeductionTemplates] = useState<Option[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<Option[]>([]);
  const [assetCategories, setAssetCategories] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedMeta = available.find((item) => item.key === selected);
  const canExport = Boolean(selectedMeta?.can_export);
  const canLoadPaymentInstitutions = permissions.has("payroll.payment_institutions.view") || permissions.has("payroll.payment_institutions.manage") || permissions.has("payroll.view") || permissions.has("payroll.reports.view") || permissions.has("reports.view");
  const canLoadCustomDeductionTemplates = permissions.has("payroll.custom_deduction_templates.view") || permissions.has("payroll.custom_deduction_templates.manage") || permissions.has("payroll.view") || permissions.has("payroll.reports.view") || permissions.has("reports.view");
  const canLoadPensionSchemes = permissions.has("payroll.pension_schemes.view") || permissions.has("payroll.pension_schemes.manage") || permissions.has("payroll.pension_contributions.view") || permissions.has("payroll.view") || permissions.has("payroll.reports.view") || permissions.has("reports.view");

  const activeFilters = useMemo(() => {
    const output: Record<string, string> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value && key !== "export_format") output[key] = value;
    });
    return output;
  }, [filters]);

  const visibleReports = useMemo(() => available.filter((item) => item.can_view), [available]);
  const groupedReports = useMemo(() => {
    const groups = new Map<string, ReportOption[]>();
    visibleReports.forEach((item) => {
      const group = item.group ?? "Core";
      groups.set(group, [...(groups.get(group) ?? []), item]);
    });
    return Array.from(groups.entries()).sort((a, b) => reportGroupOrder.indexOf(a[0]) - reportGroupOrder.indexOf(b[0]));
  }, [visibleReports]);

  async function load() {
    if (!token || !selected) return;
    setLoading(true);
    setError(null);
    setMessage(null);
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

  async function loadExportLogs() {
    if (!token) return;
    setLogsLoading(true);
    try {
      const data = await api.getReportExportLogs(token, { report_key: selected, date_from: filters.date_from, date_to: filters.date_to, status: filters.status, export_format: filters.export_format });
      setExportLogs(data.logs);
    } catch {
      setExportLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    api.getReportCenter(token)
      .then((data) => {
        const reports = data.reports as ReportOption[];
        setAvailable(reports);
        const first = reports.find((item) => item.can_view);
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
      api.listUsers(token),
      canLoadPaymentInstitutions ? api.listPaymentInstitutions(token) : Promise.resolve({ institutions: [] }),
      canLoadCustomDeductionTemplates ? api.listCustomDeductionTemplates(token) : Promise.resolve({ templates: [] }),
      canLoadPensionSchemes ? api.listPensionSchemes(token) : Promise.resolve({ schemes: [] })
    ]).then((results) => {
      const [departmentResult, positionResult, locationResult, documentTypeResult, documentCategoryResult, leaveTypeResult, payrollPeriodResult, shiftTemplateResult, assetCategoryResult, userResult, institutionResult, templateResult, pensionResult] = results;
      if (departmentResult.status === "fulfilled") setDepartments(departmentResult.value.departments);
      if (positionResult.status === "fulfilled") setPositions(positionResult.value.positions);
      if (locationResult.status === "fulfilled") setLocations(locationResult.value.locations);
      if (documentTypeResult.status === "fulfilled") setDocumentTypes(documentTypeResult.value.document_types.map((item) => ({ id: item.id, label: item.name })));
      if (documentCategoryResult.status === "fulfilled") setDocumentCategories(documentCategoryResult.value.categories.map((item) => ({ id: item.id, label: item.name })));
      if (leaveTypeResult.status === "fulfilled") setLeaveTypes(leaveTypeResult.value.leave_types.map((item) => ({ id: item.id, label: item.name })));
      if (payrollPeriodResult.status === "fulfilled") setPayrollPeriods(payrollPeriodResult.value.periods.map((item) => ({ id: item.id, label: `${String(item.period_month).padStart(2, "0")}/${item.period_year}` })));
      if (shiftTemplateResult.status === "fulfilled") setShiftTemplates(shiftTemplateResult.value.shift_templates.map((item) => ({ id: item.id, label: item.name })));
      if (assetCategoryResult.status === "fulfilled") setAssetCategories(assetCategoryResult.value.categories.map((item) => ({ id: item.id, label: item.name })));
      if (userResult.status === "fulfilled") setUsers(userResult.value.users.map((item) => ({ id: item.id, label: item.name })));
      if (institutionResult.status === "fulfilled") setPaymentInstitutions(institutionResult.value.institutions.map((item) => ({ id: item.id, label: item.name })));
      if (templateResult.status === "fulfilled") setDeductionTemplates(templateResult.value.templates.map((item) => ({ id: item.id, label: item.name })));
      if (pensionResult.status === "fulfilled") setPensionSchemes(pensionResult.value.schemes.map((item) => ({ id: item.id, label: item.scheme_name })));
    });
  }, [token, canLoadPaymentInstitutions, canLoadCustomDeductionTemplates, canLoadPensionSchemes]);

  useEffect(() => {
    if (selected) void load();
  }, [token, selected]);

  useEffect(() => {
    if (tab === "exports") void loadExportLogs();
  }, [tab, token, selected]);

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
      setMessage("CSV export created and audit logged.");
      alerts.showSuccess("Report exported", "CSV export created and audit logged.");
      if (tab === "exports") void loadExportLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      setError(message);
      alerts.showApiError(err, "Export failed.");
    }
  }

  const filterChips = Object.entries(activeFilters).filter(([, value]) => value).slice(0, 12);
  const reportDateRange = { from: filters.date_from, to: filters.date_to };
  const activeFilterChips = filterChips.map(([key, value]) => ({
    key,
    label: key.replace(/_/g, " "),
    value,
    onRemove: () => setFilter(setFilters, key as keyof FilterState, "")
  }));

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="Payroll & Compliance Reports"
        eyebrow="Report Center"
        description="Scoped payroll, pension, bank loan, custom deduction, settlement, variance, payment register reporting, HR, and compliance reporting."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Run</Button>
        }
      />
      <StandardTabs
        label="Reports section tabs"
        active={tab}
        onChange={(key) => setTab(key as Tab)}
        items={[
          { key: "reports", label: "Reports" },
          { key: "exports", label: <><History className="h-4 w-4" />Export History</> }
        ]}
      />

      <Panel className="overflow-hidden">
        <div className="p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={filters.search} onDebouncedChange={(value) => setFilter(setFilters, "search", value)} placeholder="Search employee, report row, action..." />}
            reset={<FilterResetButton onReset={() => setFilters(initialFilters)} />}
            actions={<Button variant="outline" size="sm" onClick={() => void (tab === "exports" ? loadExportLogs() : load())}>Apply</Button>}
            moreFilters={
              <MoreFiltersSheet onReset={() => setFilters(initialFilters)} onApply={() => void (tab === "exports" ? loadExportLogs() : load())}>
                <FilterSection title="Employee and organization">
                  <Input placeholder="Employee no" value={filters.employee_number} onChange={(event) => setFilter(setFilters, "employee_number", event.target.value)} />
                  <OrganizationCascadeSelector
                    value={{ locationId: filters.location_id, departmentId: filters.department_id, positionId: filters.position_id }}
                    onChange={(next) => {
                      setFilters((current) => ({
                        ...current,
                        location_id: next.locationId ?? "",
                        department_id: next.departmentId ?? "",
                        position_id: next.positionId ?? "",
                        page: "1"
                      }));
                    }}
                    departments={departments}
                    locations={locations}
                    jobLevels={[]}
                    positions={positions}
                    includeLocation
                    includeJobLevel={false}
                    requireJobLevelForPosition={false}
                    mode="report-filter"
                    labels={{ locationId: "Worksite/location", departmentId: "Department", positionId: "Position" }}
                    className="grid gap-2"
                  />
                  <SelectStatic label="Employee type" value={filters.employee_type} options={["LOCAL", "FOREIGN", "OTHER"]} onChange={(value) => setFilter(setFilters, "employee_type", value)} />
                  <SelectStatic label="Employment type" value={filters.employment_type} options={["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]} onChange={(value) => setFilter(setFilters, "employment_type", value)} />
                  <Input placeholder="Employee status" value={filters.employee_status} onChange={(event) => setFilter(setFilters, "employee_status", event.target.value)} />
                </FilterSection>
                <FilterSection title="Payroll and compliance">
                  <Input placeholder="Row status" value={filters.status} onChange={(event) => setFilter(setFilters, "status", event.target.value)} />
                  <Input placeholder="Payroll run status" value={filters.payroll_run_status} onChange={(event) => setFilter(setFilters, "payroll_run_status", event.target.value)} />
                  <Input placeholder="Payment status" value={filters.payment_status} onChange={(event) => setFilter(setFilters, "payment_status", event.target.value)} />
                  <SelectFilter label="Pension scheme" value={filters.pension_scheme_id} options={pensionSchemes} onChange={(value) => setFilter(setFilters, "pension_scheme_id", value)} />
                  <SelectFilter label="Bank/payment institution" value={filters.payment_institution_id} options={paymentInstitutions} onChange={(value) => setFilter(setFilters, "payment_institution_id", value)} />
                  <SelectFilter label="Deduction template" value={filters.deduction_template_id} options={deductionTemplates} onChange={(value) => setFilter(setFilters, "deduction_template_id", value)} />
                  <Input placeholder="Deduction category" value={filters.deduction_category} onChange={(event) => setFilter(setFilters, "deduction_category", event.target.value)} />
                  <Input placeholder="Final settlement status" value={filters.final_settlement_status} onChange={(event) => setFilter(setFilters, "final_settlement_status", event.target.value)} />
                </FilterSection>
                <FilterSection title="Attendance, leave, documents, and audit">
                  <SelectFilter label="Leave type" value={filters.leave_type_id} options={leaveTypes} onChange={(value) => setFilter(setFilters, "leave_type_id", value)} />
                  <Input placeholder="Attendance status" value={filters.attendance_status} onChange={(event) => setFilter(setFilters, "attendance_status", event.target.value)} />
                  <SelectStatic label="Pending my approval" value={filters.pending_my_approval} options={["true"]} onChange={(value) => setFilter(setFilters, "pending_my_approval", value)} />
                  <SelectFilter label="Document type" value={filters.document_type_id} options={documentTypes} onChange={(value) => setFilter(setFilters, "document_type_id", value)} />
                  <SelectFilter label="Category" value={filters.category_id} options={documentCategories.concat(assetCategories)} onChange={(value) => setFilter(setFilters, "category_id", value)} />
                  <SelectStatic label="Sensitive" value={filters.sensitive} options={["true", "false"]} onChange={(value) => setFilter(setFilters, "sensitive", value)} />
                  <SelectStatic label="Source" value={filters.source} options={["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"]} onChange={(value) => setFilter(setFilters, "source", value)} />
                  <SelectStatic label="Missed punch" value={filters.missed_punch} options={["true"]} onChange={(value) => setFilter(setFilters, "missed_punch", value)} />
                  <SelectStatic label="Late only" value={filters.late_only} options={["true"]} onChange={(value) => setFilter(setFilters, "late_only", value)} />
                  <SelectStatic label="Early leave" value={filters.early_checkout_only} options={["true"]} onChange={(value) => setFilter(setFilters, "early_checkout_only", value)} />
                  <StandardDateRangeFilter value={{ from: filters.week_start_date, to: filters.week_start_date }} onChange={(range) => setFilter(setFilters, "week_start_date", range.from ?? "")} label="Week Start Date" />
                  <SelectFilter label="Shift" value={filters.shift_template_id} options={shiftTemplates} onChange={(value) => setFilter(setFilters, "shift_template_id", value)} />
                  <SelectFilter label="Actor" value={filters.actor_user_id} options={users} onChange={(value) => setFilter(setFilters, "actor_user_id", value)} />
                  <Input placeholder="Audit module" value={filters.module} onChange={(event) => setFilter(setFilters, "module", event.target.value)} />
                  <Input placeholder="Audit action" value={filters.action} onChange={(event) => setFilter(setFilters, "action", event.target.value)} />
                  <Input placeholder="Entity type" value={filters.entity_type} onChange={(event) => setFilter(setFilters, "entity_type", event.target.value)} />
                </FilterSection>
              </MoreFiltersSheet>
            }
          >
            <SelectField className="h-10 min-w-[260px] rounded-md border bg-white px-3 text-sm" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {groupedReports.map(([group, reports]) => (
                <optgroup key={group} label={group}>
                  {reports.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
            <StandardDateRangeFilter value={reportDateRange} onChange={(range) => setFilters((current) => ({ ...current, date_from: range.from ?? "", date_to: range.to ?? "", page: "1" }))} label="Report Date Range" />
            <SelectFilter label="Payroll period" value={filters.payroll_period_id} options={payrollPeriods} onChange={(value) => setFilter(setFilters, "payroll_period_id", value)} />
            <SelectStatic label="Export format" value={filters.export_format} options={["CSV", "JSON", "EXCEL", "PDF"]} onChange={(value) => setFilter(setFilters, "export_format", value)} />
          </StandardFilterBar>
        </div>
        <ActiveFilterChips chips={activeFilterChips} className="border-t px-3 py-3" />
        {message ? <div className="border-t p-3"><AlertBanner tone="warning">{message}</AlertBanner></div> : null}
      </Panel>

      <ExportActionBar>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Export selected report</p>
          <p className="text-xs text-muted-foreground">CSV export uses the backend audit log. Excel and PDF exports use the currently loaded report rows and active filters.</p>
        </div>
        <ExportMenu
          moduleName={report?.label ?? selectedMeta?.label ?? "Report"}
          rows={report?.rows ?? []}
          columns={report?.columns ?? []}
          disabled={!canExport || !report?.rows.length}
          filterSummary={Object.entries(activeFilters).map(([key, value]) => `${key}: ${value}`)}
          onBackendExport={async (format) => {
            if (format === "csv") {
              await exportCsv();
              return;
            }
            const { exportRows } = await import("../lib/export-utils");
            exportRows(format, report?.label ?? selectedMeta?.label ?? "Report", report?.columns ?? [], report?.rows ?? [], Object.entries(activeFilters).map(([key, value]) => `${key}: ${value}`));
          }}
        />
      </ExportActionBar>

      {tab === "reports" ? (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{report?.label ?? "Report results"}</h2>
              <p className="text-xs text-muted-foreground">{report?.group ?? selectedMeta?.group ?? "Reports"} · Export uses these exact filters and is audit logged.</p>
            </div>
            <span className="text-xs text-muted-foreground">{report?.rows.length ?? 0} visible rows</span>
          </div>
          <ReportTable columns={report?.columns ?? []} rows={report?.rows ?? []} loading={loading} error={error} />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Export History / Report Audit Logs</h2>
              <p className="text-xs text-muted-foreground">CSV/JSON export audit logs, sensitive export flags, filters, and requester details.</p>
            </div>
            <ActionTextButton intent="refresh" size="sm" onClick={() => void loadExportLogs()}><RefreshCw className="h-4 w-4" /> Refresh</ActionTextButton>
          </div>
          <ReportTable columns={["requested_at", "report_key", "report_name", "export_format", "row_count", "status", "sensitive_export", "requested_by_name", "file_name"]} rows={exportLogs} loading={logsLoading} error={null} />
        </Panel>
      )}
    </PageShell>
  );
}

function ReportTable({ columns, rows, loading, error }: { columns: string[]; rows: Row[]; loading?: boolean; error?: string | null }) {
  return (
    <DataTableFrame loading={loading} error={error} empty={!loading && !error && rows.length === 0} emptyTitle="No report rows found" emptyDescription="Adjust filters or run the report after source records are created.">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white">
          <TableRow>{columns.map((column) => <TableHead key={column} className="whitespace-nowrap">{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={String(row.id ?? `${row.report_key ?? "row"}-${index}`)}>
              {columns.map((column) => (
                <TableCell key={column} className="whitespace-nowrap">
                  {statusColumns.has(column) ? <StatusBadge value={row[column]} /> : String(row[column] ?? "-")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableFrame>
  );
}

function setFilter(setFilters: Dispatch<SetStateAction<FilterState>>, key: keyof FilterState, value: string) {
  setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? value : "1" }));
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} title={label}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={`${label}-${option.id}`} value={option.id}>{option.label}</option>
      ))}
    </SelectField>
  );
}

function SelectStatic({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} title={label}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
      ))}
    </SelectField>
  );
}
