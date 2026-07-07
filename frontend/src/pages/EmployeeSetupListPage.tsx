import { CheckCircle2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { TablePaginationBar } from "../components/table/TablePaginationBar";
import { PerformanceDataTable } from "../components/table/PerformanceDataTable";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { AlertBanner, PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedTableFilters } from "../hooks/useDebouncedTableFilters";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";

type SetupSummary = {
  source_case_id?: string | null;
  section_count?: number;
  required_count?: number;
  complete_required_count?: number;
  blocked_count?: number;
  failed_count?: number;
  stale_count?: number;
  verified_count?: number;
  last_evaluated_at?: string | null;
};

type SetupEmployee = Employee & {
  setup_summary?: SetupSummary;
};

const setupStatuses = [
  { value: "PENDING_SETUP", label: "Pending Setup" },
  { value: "PENDING_FINAL_VERIFICATION", label: "Pending Final Verification" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "DRAFT_ONBOARDING", label: "Draft Onboarding" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "NOT_ACTIVE", label: "Not Active" }
];

function completionLabel(summary?: SetupSummary) {
  const complete = Number(summary?.complete_required_count ?? 0);
  const required = Number(summary?.required_count ?? 0);
  if (!required) return "Not built";
  return `${complete}/${required}`;
}

function setupTone(summary?: SetupSummary) {
  if (Number(summary?.failed_count ?? 0) > 0) return "danger" as const;
  if (Number(summary?.blocked_count ?? 0) > 0 || Number(summary?.stale_count ?? 0) > 0) return "warning" as const;
  if (Number(summary?.required_count ?? 0) > 0 && Number(summary?.complete_required_count ?? 0) >= Number(summary?.required_count ?? 0)) return "success" as const;
  return "neutral" as const;
}

export function EmployeeSetupListPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.view");
  const [search, setSearch] = useState("");
  const [statusKey, setStatusKey] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filters = useMemo(() => ({
    search: search.trim() || undefined,
    status_key: statusKey === "all" ? undefined : statusKey
  }), [search, statusKey]);
  const { debouncedFilters, isDebouncing } = useDebouncedTableFilters(filters, 300);
  const query = usePaginatedQuery<{ setup_employees: SetupEmployee[]; employees: SetupEmployee[]; pagination?: Record<string, unknown> }>({
    scope: user?.id,
    tableName: "employee-setup-queue",
    page,
    pageSize,
    filters: debouncedFilters,
    enabled: Boolean(token && canView),
    queryFn: ({ signal, pagination }) => api.listEmployeeSetupQueue(token!, { ...debouncedFilters, limit: pagination.limit, offset: pagination.offset }, signal),
    getRowCount: (data) => (data?.setup_employees ?? data?.employees ?? []).length
  });
  const rows = query.data?.setup_employees ?? query.data?.employees ?? [];
  const error = query.error instanceof ApiError ? query.error.message : query.error?.message ?? null;

  if (!canView) {
    return <PageShell><Panel><EmptyState title="Employee setup unavailable" description="Your account needs employees.view permission." /></Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="Employee 360 Setup"
        description="Complete pending employee setup, run final verification, and submit activation from Employee 360."
        actions={
          <>
            <Link to="/employees"><Button variant="outline" size="sm">All employees</Button></Link>
            <ActionTextButton intent="refresh" size="sm" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</ActionTextButton>
          </>
        }
      />
      {error ? <AlertBanner tone="danger"><strong>Unable to load setup queue.</strong> {error}</AlertBanner> : null}
      <StandardFilterBar
        search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search setup employees..." />}
      >
        <StandardSelectFilter value={statusKey === "all" ? "" : statusKey} onValueChange={(value) => { setStatusKey(value || "all"); setPage(1); }} allLabel="All setup statuses" width="status" options={setupStatuses} />
      </StandardFilterBar>
      <PerformanceDataTable
        loading={query.isInitialLoading}
        refreshing={query.isRefreshing || isDebouncing}
        error={error}
        empty={rows.length === 0}
        rowCount={rows.length}
        emptyTitle="No pending setup employees"
        emptyDescription="Employees waiting for setup or final verification will appear here."
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <div className="flex flex-col gap-2">
          {rows.map((employee) => {
            const summary = employee.setup_summary;
            const to = `/employees/${employee.id}?setup=1`;
            return (
              <div
                key={employee.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "0.9rem 1.1rem",
                  background: "var(--v3-surface-2)",
                  border: "0.5px solid var(--v3-border)",
                  borderRadius: "var(--v3-radius-card)"
                }}
              >
                <div className="min-w-0 flex-1">
                  <EmployeeIdentityCell
                    employee={employee}
                    token={token}
                    size="md"
                    showMetadata={false}
                    employeeName={employee.full_name}
                    employeeNumber={employee.employee_no}
                    to={to}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[52px] text-xs text-muted-foreground">
                    <span>{employee.employee_no}</span>
                    {employee.department_name ? <><span className="text-[var(--v3-border-strong)]">&middot;</span><span>{employee.department_name}</span></> : null}
                    {employee.position_title ? <><span className="text-[var(--v3-border-strong)]">&middot;</span><span>{employee.position_title}</span></> : null}
                    <span className="text-[var(--v3-border-strong)]">&middot;</span>
                    <span>Source case {employee.active_onboarding_case_number ?? summary?.source_case_id ?? "-"}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-[52px]">
                    {Number(summary?.blocked_count ?? 0) ? <Badge tone="warning">{summary?.blocked_count} blocked</Badge> : null}
                    {Number(summary?.failed_count ?? 0) ? <Badge tone="danger">{summary?.failed_count} failed</Badge> : null}
                    {Number(summary?.stale_count ?? 0) ? <Badge tone="warning">{summary?.stale_count} stale</Badge> : null}
                    {!Number(summary?.blocked_count ?? 0) && !Number(summary?.failed_count ?? 0) && !Number(summary?.stale_count ?? 0) ? <Badge tone="neutral">No blockers</Badge> : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={setupTone(summary)}>{completionLabel(summary)}</Badge>
                  <StatusBadge value={employee.status_name ?? employee.status_key ?? "-"} />
                  <RowActionButton intent="view" title="Open Employee 360 setup" onClick={() => navigate(to)}><CheckCircle2 className="h-4 w-4" /></RowActionButton>
                </div>
              </div>
            );
          })}
        </div>
      </PerformanceDataTable>
      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        rowCount={rows.length}
        hasMore={Boolean(query.data?.pagination?.has_more)}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </PageShell>
  );
}
