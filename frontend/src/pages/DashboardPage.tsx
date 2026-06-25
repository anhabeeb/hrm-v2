import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { DashboardWidget, MetricGrid, PageHeader, PageShell, QuickActionCard } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type DashboardData = Record<string, unknown>;
type Row = Record<string, unknown>;

function section(data: DashboardData | null, key: string) {
  const value = data?.[key];
  return value && typeof value === "object" ? (value as Row) : null;
}

function list(value: unknown) {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function number(value: unknown) {
  return Number(value ?? 0);
}

export function DashboardPage() {
  const { token, user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await api.getMainDashboard(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const employees = section(dashboard, "employees");
  const documents = section(dashboard, "documents");
  const attendance = section(dashboard, "attendance");
  const leave = section(dashboard, "leave");
  const roster = section(dashboard, "roster");
  const payroll = section(dashboard, "payroll");
  const assets = section(dashboard, "assets");
  const audit = section(dashboard, "audit");
  const quickLinks = list(dashboard?.quick_links).filter((item) => user?.permissions.includes(String(item.permission)));

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        eyebrow="HRM command center"
        description="Compact HR operating overview with permission-safe counters, live-workflow shortcuts, and scope-aware activity."
        actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        }
      />

      <DataTableFrame loading={loading} error={error} empty={!loading && !error && !dashboard}>
        <MetricGrid className="p-3">
          {employees ? <MetricGroup title="Employees" to="/employees" rows={[["Total", employees.total_employees], ["Active", employees.active_employees], ["Onboarding", employees.onboarding_employees]]} /> : null}
          {documents ? <MetricGroup title="Documents" to="/documents" rows={[["Missing", documents.missing_required_documents], ["Expiring", documents.expiring_documents], ["Expired", documents.expired_documents]]} /> : null}
          {attendance ? <MetricGroup title="Attendance" to="/attendance" rows={[["Present", attendance.today_present], ["Absent", attendance.today_absent], ["Late", attendance.today_late], ["Missed punch", attendance.missed_punches_today]]} /> : null}
          {leave ? <MetricGroup title="Leave" to="/leave" rows={[["Pending", leave.pending_leave_approvals], ["On leave", leave.employees_currently_on_leave], ["Upcoming", leave.upcoming_leave]]} /> : null}
          {roster ? <MetricGroup title="Roster" to="/roster" rows={[["Scheduled", roster.employees_scheduled_this_week], ["Unassigned", roster.unassigned_employees_this_week], ["On leave", roster.employees_on_leave_this_week]]} /> : null}
          {payroll ? <MetricGroup title="Payroll" to="/payroll" rows={[["Draft runs", payroll.draft_payroll_runs], ["Approved", payroll.approved_payroll_runs], ["Holds", payroll.payroll_holds], ["Advances", payroll.pending_advances]]} /> : null}
          {assets ? <MetricGroup title="Assets" to="/assets" rows={[["Issued", assets.issued_assets], ["Pending returns", assets.pending_returns], ["Damaged", assets.damaged_assets], ["Lost", assets.lost_assets]]} /> : null}
          {audit ? <MetricGroup title="Audit" to="/audit" rows={[["Sensitive actions", audit.sensitive_actions_count]]} /> : null}
        </MetricGrid>
      </DataTableFrame>

      {quickLinks.length ? (
        <DashboardWidget title="Priority links" description="Shortcuts into the records that usually need attention first.">
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <QuickActionCard
                key={String(link.to)}
                title={String(link.label)}
                description="Open scoped operational queue"
                action={<Link to={String(link.to)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open <ArrowRight className="h-3.5 w-3.5" /></Link>}
              />
            ))}
          </div>
        </DashboardWidget>
      ) : null}

      {documents ? <PriorityTable title="Recent document uploads" rows={list(documents.recent_document_uploads)} columns={["employee_no", "employee_name", "document_type_name", "created_at"]} /> : null}
      {audit ? <PriorityTable title="Recent audit activity" rows={list(audit.recent_audit_activity)} columns={["created_at", "actor_name", "module", "action", "entity_type"]} statusColumn="module" /> : null}
    </PageShell>
  );
}

function MetricGroup({ title, to, rows }: { title: string; to: string; rows: [string, unknown][] }) {
  return (
    <Panel className="overflow-hidden rounded-md shadow-none">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link to={to} className="text-xs text-primary hover:underline">Open</Link>
      </div>
      <div className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Badge tone={number(value) > 0 ? "info" : "neutral"}>{number(value)}</Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PriorityTable({ title, rows, columns, statusColumn }: { title: string; rows: Row[]; columns: string[]; statusColumn?: string }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <DataTableFrame empty={!rows.length}>
        <Table>
          <TableHeader className="sticky top-0">
            <TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={String(row.id ?? index)}>
                {columns.map((column) => (
                  <TableCell key={column}>{column === statusColumn ? <StatusBadge value={row[column]} /> : String(row[column] ?? "-")}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableFrame>
    </Panel>
  );
}
