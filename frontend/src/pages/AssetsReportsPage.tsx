import { useEffect, useMemo, useState } from "react";
import { AssetCardRow, AssetMetaChip, AssetMetaDot } from "../components/assets/AssetCardRow";
import { AssetsNav } from "../components/assets/AssetsNav";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { PerformanceDataTable } from "../components/table/PerformanceDataTable";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetCategory } from "../types/assets";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const columns = ["employee_no", "employee_name", "department_name", "location_name", "asset_code", "asset_name", "category_name", "status", "issued_date", "expected_return_date", "returned_date", "deduction_amount"];
const metaColumns = columns.filter((column) => column !== "employee_name" && column !== "status");

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
  const activeFilterChips = useMemo(() => [
    ...(filters.search ? [{ key: "search", label: "Search", value: filters.search, onRemove: () => setFilters((current) => ({ ...current, search: "" })) }] : []),
    ...(filters.status ? [{ key: "status", label: "Status", value: filters.status.replace(/_/g, " "), title: filters.status, onRemove: () => setFilters((current) => ({ ...current, status: "" })) }] : []),
    ...(filters.category_id ? [{ key: "category", label: "Category", value: categories.find((category) => category.id === filters.category_id)?.name ?? filters.category_id, onRemove: () => setFilters((current) => ({ ...current, category_id: "" })) }] : []),
    ...(filters.location_id ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === filters.location_id)?.name ?? filters.location_id, onRemove: () => setFilters((current) => ({ ...current, location_id: "" })) }] : []),
    ...(filters.department_id ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === filters.department_id)?.name ?? filters.department_id, onRemove: () => setFilters((current) => ({ ...current, department_id: "" })) }] : []),
    ...(filters.issued_date_from || filters.issued_date_to ? [{ key: "issued", label: "Issued", value: formatDateRangeLabel(issuedRange), onRemove: () => setFilters((current) => ({ ...current, issued_date_from: "", issued_date_to: "" })) }] : [])
  ], [categories, departments, filters, issuedRange, locations]);

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

  return (
      <PageShell>
      <PageHeader title="Asset Reports" description="Export-friendly asset assignment and deduction reporting." />
      <AssetsNav />
      <Panel className="p-4">
        <StandardFilterBar
          search={<StandardSearchInput value={filters.search} onDebouncedChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Employee or asset" />}
          reset={<FilterResetButton onReset={resetFilters} />}
          actions={<><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>{canExport ? (
            <ExportMenu
              moduleName="Asset Reports"
              rows={rows}
              columns={columns}
              filterSummary={Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)}
              onBackendExport={async (format) => {
                const { exportRows } = await import("../lib/export-utils");
                exportRows(format, "Asset Reports", columns, rows, Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`));
              }}
            />
          ) : null}</>}
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
        <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
      </Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <PerformanceDataTable
        empty={rows.length === 0}
        rowCount={rows.length}
        emptyTitle="No report rows"
        emptyDescription="Adjust filters or issue assets to employees."
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <AssetCardRow
              key={index}
              title={String(row.employee_name ?? "-")}
              meta={
                <>
                  {metaColumns.map((column, columnIndex) => (
                    <span key={column} className="flex items-center gap-1.5">
                      {columnIndex > 0 ? <AssetMetaDot /> : null}
                      <AssetMetaChip>{`${column.replace(/_/g, " ")}: ${String(row[column] ?? "-")}`}</AssetMetaChip>
                    </span>
                  ))}
                </>
              }
              trailing={row.status ? <Badge tone={row.status === "ISSUED" ? "success" : row.status === "RETURNED" ? "neutral" : "warning"}>{String(row.status)}</Badge> : null}
            />
          ))}
        </div>
      </PerformanceDataTable>
    </PageShell>
  );
}
