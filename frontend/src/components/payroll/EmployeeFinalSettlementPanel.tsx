import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ActionTextButton } from "../ui/action-button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import type { Employee } from "../../types/employees";
import type { FinalSettlementCase, FinalSettlementSummary } from "../../types/final-settlement";

function money(value: unknown) {
  if (value == null) return "Restricted";
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tone(status?: string | null) {
  if (["APPROVED", "FINALIZED", "LOCKED", "CLEARED", "MANUALLY_CONFIRMED_PAID"].includes(status ?? "")) return "success";
  if (["READY_FOR_REVIEW", "SUBMITTED_FOR_APPROVAL", "PENDING", "PREPARED"].includes(status ?? "")) return "warning";
  if (["REJECTED", "CANCELLED", "BLOCKED"].includes(status ?? "")) return "danger";
  return "neutral";
}

export function EmployeeFinalSettlementPanel({ employee }: { employee: Employee }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const [cases, setCases] = useState<FinalSettlementCase[]>([]);
  const [summary, setSummary] = useState<FinalSettlementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canOpen = permissions.has("final_settlement.view") || permissions.has("final_settlement.cases.view") || permissions.has("final_settlement.manage");

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [caseResult, summaryResult] = await Promise.all([
        api.listEmployeeFinalSettlements(token, employee.id),
        api.getEmployeeFinalSettlementSummary(token, employee.id)
      ]);
      setCases(caseResult.cases ?? []);
      setSummary(summaryResult.summary ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load final settlement records.");
    }
  }

  useEffect(() => {
    void load();
  }, [token, employee.id]);

  const latest = summary?.case ?? cases[0] ?? null;
  const warningRows = summary?.line_items?.filter((row) => row.line_type === "WARNING" || row.line_type === "INFO") ?? [];

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Final settlement</h2>
            <p className="text-sm text-muted-foreground">Exit payroll status, clearance, approval, payment, and integration warnings for this employee.</p>
          </div>
          {canOpen ? <Link to="/payroll/exit-payroll"><ActionTextButton intent="open" size="sm">Open Exit Payroll</ActionTextButton></Link> : null}
        </div>
        {latest ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="Case status" value={latest.status} badge />
            <Metric label="Exit" value={`${latest.exit_type} / ${latest.last_working_day}`} />
            <Metric label="Net settlement" value={money(latest.net_settlement_amount)} />
            <Metric label="Payment" value={latest.payment_status ?? "PENDING"} badge />
          </div>
        ) : <EmptyState title="No final settlement case" description="Exit payroll cases for this employee will appear here after creation." />}
      </Panel>

      {summary ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SmallTable title="Line items" rows={(summary.line_items ?? []) as unknown as Record<string, unknown>[]} columns={["line_type", "component_source", "component_name", "amount"]} />
          <SmallTable title="Clearance" rows={(summary.clearance ?? []) as unknown as Record<string, unknown>[]} columns={["clearance_type", "title", "status", "deduction_amount", "reason"]} />
          <SmallTable title="Approval and finalization timeline" rows={(summary.events ?? []) as unknown as Record<string, unknown>[]} columns={["action", "previous_status", "new_status", "actor_name_snapshot", "reason", "created_at"]} />
          <SmallTable title="Warnings" rows={warningRows as unknown as Record<string, unknown>[]} columns={["component_source", "component_name", "notes"]} />
        </div>
      ) : null}

      {cases.length ? <SmallTable title="Settlement history" rows={cases as unknown as Record<string, unknown>[]} columns={["settlement_number", "exit_type", "status", "clearance_status", "payment_status", "created_at"]} /> : null}
    </div>
  );
}

function Metric({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return <div className="rounded-md border px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold">{badge ? <Badge tone={tone(value)}>{value}</Badge> : value}</div></div>;
}

function SmallTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns: string[] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{column === "amount" || column === "deduction_amount" || column.includes("net") ? money(row[column]) : String(row[column] ?? "-")}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </div>
      {!rows.length ? <EmptyState title="No rows" description="Records will appear after the settlement is calculated." /> : null}
    </Panel>
  );
}
