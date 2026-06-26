import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { AssetsNav } from "../components/assets/AssetsNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { SelectField } from "../components/ui/page-shell";
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
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Asset Reports</h1><p className="text-sm text-muted-foreground">Export-friendly asset assignment and deduction reporting.</p></div>
      <Panel className="p-0"><AssetsNav /><div className="flex flex-wrap gap-2 p-4"><Input className="w-56" placeholder="Employee or asset" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={["ISSUED","RETURNED","DAMAGED","LOST","REPLACED","WRITTEN_OFF"]} empty="All status" /><Select value={filters.category_id} onChange={(category_id) => setFilters({ ...filters, category_id })} options={categories.map((category) => [category.id, category.name])} empty="All categories" /><Select value={filters.department_id} onChange={(department_id) => setFilters({ ...filters, department_id })} options={departments.map((department) => [department.id, department.name])} empty="All departments" /><Select value={filters.location_id} onChange={(location_id) => setFilters({ ...filters, location_id })} options={locations.map((location) => [location.id, location.name])} empty="All locations" /><Input className="w-40" type="date" value={filters.issued_date_from} onChange={(event) => setFilters({ ...filters, issued_date_from: event.target.value })} /><Input className="w-40" type="date" value={filters.issued_date_to} onChange={(event) => setFilters({ ...filters, issued_date_to: event.target.value })} /><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>{canExport ? <Button variant="outline" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button> : null}</div></Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((column) => <TableCell key={column}>{String(row[column] ?? "-")}</TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length ? <EmptyState title="No report rows" description="Adjust filters or issue assets to employees." /> : null}</div></Panel>
    </div>
  );
}

function Select({ value, onChange, options, empty }: { value: string; onChange: (value: string) => void; options: Array<string | [string, string]>; empty: string }) {
  return <SelectField value={value} onValueChange={onChange}><option value="">{empty}</option>{options.map((option) => { const id = Array.isArray(option) ? option[0] : option; const label = Array.isArray(option) ? option[1] : option; return <option key={id} value={id}>{label}</option>; })}</SelectField>;
}
