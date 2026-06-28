import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { AssetsNav } from "../components/assets/AssetsNav";
import { FilterResetButton, FilterSection, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetCategory } from "../types/assets";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const columns = ["employee_no", "employee_name", "department_name", "location_name", "asset_code", "asset_name", "category_name", "status", "issued_date", "expected_return_date", "returned_date", "deduction_amount"];

export function AssetsReportsPage() {
  const { token, user } = useAuth();
  const canExport = user?.permissions.includes("assets.reports.export");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", category_id: "", department_id: "", location_id: "", issued_date_from: "", issued_date_to: "" });
  const [error, setError] = useState<string | null>(null);
  const issuedRange = { from: filters.issued_date_from, to: filters.issued_date_to };
  const resetFilters = () => setFilters({ search: "", status: "", category_id: "", department_id: "", location_id: "", issued_date_from: "", issued_date_to: "" });

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [reportRows, categoryRows, departmentRows, locationRows] = await Promise.all([api.getAssetsReports(token, filters), api.listAssetCategories(token), api.listDepartments(token), api.listLocations(token)]);
      setRows(reportRows.reports ?? []);
      setCategories(categoryRows.categories ?? []);
      setDepartments(departmentRows.departments ?? []);
      setLocations(locationRows.locations ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset reports.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function exportCsv() {
    if (!token) return;
    try {
      const file = await api.exportAssetsReportCsv(token, filters);
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export report.");
    }
  }

  return (
      <PageShell>
      <PageHeader title="Asset Reports" description="Export-friendly asset assignment and deduction reporting." />
      <AssetsNav />
      <Panel className="p-4">
        <StandardFilterBar
          search={<StandardSearchInput value={filters.search} onDebouncedChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Employee or asset" />}
          reset={<FilterResetButton onReset={resetFilters} />}
          actions={<><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>{canExport ? <Button variant="outline" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button> : null}</>}
          moreFilters={
            <MoreFiltersSheet onReset={resetFilters} onApply={() => void load()}>
              <FilterSection title="Organization and dates">
                <OrganizationCascadeSelector value={{ locationId: filters.location_id, departmentId: filters.department_id }} onChange={(next) => setFilters((current) => ({ ...current, location_id: next.locationId ?? "", department_id: next.departmentId ?? "" }))} departments={departments} locations={locations} jobLevels={[]} positions={[]} includeLocation includeJobLevel={false} includePosition={false} mode="asset-rule" labels={{ locationId: "Location", departmentId: "Department" }} className="grid gap-2" />
                <StandardDateRangeFilter value={issuedRange} onChange={(range) => setFilters((current) => ({ ...current, issued_date_from: range.from ?? "", issued_date_to: range.to ?? "" }))} label="Issued Date Range" />
              </FilterSection>
            </MoreFiltersSheet>
          }
        >
          <StandardSelectFilter value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status }))} allLabel="All status" width="status" options={["ISSUED","RETURNED","DAMAGED","LOST","REPLACED","WRITTEN_OFF"].map((value) => ({ value, label: value }))} />
          <StandardSelectFilter value={filters.category_id} onValueChange={(category_id) => setFilters((current) => ({ ...current, category_id }))} allLabel="All categories" width="documentType" options={categories.map((category) => ({ value: category.id, label: category.name }))} />
        </StandardFilterBar>
      </Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((column) => <TableCell key={column}>{String(row[column] ?? "-")}</TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length ? <EmptyState title="No report rows" description="Adjust filters or issue assets to employees." /> : null}</div></Panel>
    </PageShell>
  );
}
