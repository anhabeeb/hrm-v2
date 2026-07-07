import { CalendarPlus, Edit, PlayCircle, Search, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { TableSkeleton } from "../components/loading";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge, humanizeStatus } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollPeriod } from "../types/payroll";

const statuses = ["", "DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"];
const defaultPayrollYear = String(new Date().getFullYear());

function normalizePeriodStatus(status: string) {
  if (status === "OPEN") return "DRAFT";
  if (status === "PROCESSING") return "CALCULATING";
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID" || status === "CLOSED") return "FINALIZED_PLACEHOLDER";
  return status;
}

function MetaChip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <span style={{ fontSize: 12, color: "var(--v3-text-secondary)" }}>{children}</span>;
}

function Dot() {
  return <span style={{ color: "var(--v3-border-strong)" }}>&middot;</span>;
}

function PeriodCardRow({ period, canUpdate, canCalculate, canCancel, displayStatus, onEdit, onGenerate, onCancel }: {
  period: PayrollPeriod;
  canUpdate: boolean;
  canCalculate: boolean;
  canCancel: boolean;
  displayStatus: string;
  onEdit: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div
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
        <div className="text-sm font-semibold">{period.period_month}/{period.period_year}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <MetaChip>Start {period.start_date}</MetaChip>
          <Dot /><MetaChip>End {period.end_date}</MetaChip>
          <Dot /><MetaChip>Payment {period.salary_payment_date ?? "-"}</MetaChip>
          <Dot /><MetaChip>By {period.created_by_name ?? "-"}</MetaChip>
          {period.approved_at ? <><Dot /><MetaChip>Approved {period.approved_at}</MetaChip></> : null}
          {period.paid_at ? <><Dot /><MetaChip>Paid {period.paid_at}</MetaChip></> : null}
          {period.closed_at ? <><Dot /><MetaChip>Closed {period.closed_at}</MetaChip></> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge value={displayStatus} />
        <div className="flex gap-1">
          <Link to={`/payroll/runs?period_id=${period.id}`}><RowActionButton intent="view" title="Open runs"><Search className="h-4 w-4" /></RowActionButton></Link>
          {canUpdate ? <RowActionButton intent="edit" title="Edit period" onClick={onEdit}><Edit className="h-4 w-4" /></RowActionButton> : null}
          {canCalculate ? <RowActionButton intent="generate" title="Generate run" onClick={onGenerate}><PlayCircle className="h-4 w-4" /></RowActionButton> : null}
          {canCancel && !["FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"].includes(displayStatus) ? <RowActionButton intent="delete" title="Cancel period" onClick={onCancel}><XCircle className="h-4 w-4" /></RowActionButton> : null}
        </div>
      </div>
    </div>
  );
}

export function PayrollPeriodsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.periods.view") || permissions.has("payroll.view");
  const canCreate = permissions.has("payroll.periods.create") || permissions.has("payroll.periods.manage") || permissions.has("payroll.manage");
  const canUpdate = permissions.has("payroll.periods.update") || permissions.has("payroll.periods.manage") || permissions.has("payroll.manage");
  const canCalculate = permissions.has("payroll.periods.calculate") || permissions.has("payroll.runs.calculate") || permissions.has("payroll.periods.manage") || permissions.has("payroll.runs.manage") || permissions.has("payroll.manage");
  const canCancel = permissions.has("payroll.periods.cancel") || permissions.has("payroll.periods.manage") || permissions.has("payroll.manage");
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [year, setYear] = useState(defaultPayrollYear);
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ type: "create" | "edit" | "generate" | "cancel"; period?: PayrollPeriod } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const filters = useMemo(() => ({ year, month, status, search }), [year, month, status, search]);
  const yearOptions = useMemo(() => Array.from(new Set([defaultPayrollYear, ...periods.map((period) => String(period.period_year))])).sort((a, b) => Number(b) - Number(a)), [periods]);
  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setMonth("");
    setYear(defaultPayrollYear);
  };
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: humanizeStatus(status), title: status, onRemove: () => setStatus("") }] : []),
    ...(month ? [{ key: "month", label: "Month", value: month, onRemove: () => setMonth("") }] : []),
    ...(year && year !== defaultPayrollYear ? [{ key: "year", label: "Year", value: year, onRemove: () => setYear(defaultPayrollYear) }] : [])
  ], [month, search, status, year]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setPeriods((await api.listPayrollPeriods(token, filters)).periods);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payroll periods.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  async function submitModal() {
    if (!token) return;
    try {
      if (modal?.type === "create") {
        await api.createPayrollPeriod(token, { period_month: Number(form.period_month), period_year: Number(form.period_year), start_date: form.start_date || undefined, end_date: form.end_date || undefined, salary_payment_date: form.salary_payment_date || undefined });
      }
      if (modal?.type === "edit" && modal.period) {
        await api.updatePayrollPeriod(token, modal.period.id, { start_date: form.start_date, end_date: form.end_date, salary_payment_date: form.salary_payment_date || null });
      }
      if (modal?.type === "generate" && modal.period) {
        await api.generatePayrollRun(token, { payroll_period_id: modal.period.id });
      }
      if (modal?.type === "cancel" && modal.period) {
        if (!form.reason?.trim()) {
          setError("Cancellation reason is required.");
          return;
        }
        await api.cancelPayrollPeriod(token, modal.period.id, form.reason.trim());
      }
      setModal(null);
      setForm({});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update payroll period.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Payroll periods unavailable" description="Your account needs payroll.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Payroll Periods"
        description="Create month-end payroll windows and generate runs."
        actions={canCreate ? <Button size="sm" onClick={() => { setForm({ period_month: String(new Date().getMonth() + 1), period_year: String(new Date().getFullYear()) }); setModal({ type: "create" }); }}><CalendarPlus className="h-4 w-4" /> Create period</Button> : null}
      />
      <PayrollNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search period" />}
            reset={<FilterResetButton onReset={resetFilters} />}
            moreFilters={
              <MoreFiltersSheet title="Payroll period filters" onReset={() => { setYear(defaultPayrollYear); setMonth(""); }}>
                <FilterSection title="Period">
                  <StandardSelectFilter value={year} onValueChange={setYear} allLabel="Current year" width="status" options={yearOptions.map((item) => ({ value: item, label: item }))} />
                  <StandardSelectFilter value={month} onValueChange={setMonth} allLabel="All months" width="status" options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} />
                </FilterSection>
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={statuses.filter(Boolean).map((item) => ({ value: item, label: humanizeStatus(item) }))} />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={8} label="Loading payroll periods" />
        ) : periods.length === 0 ? (
          <EmptyState title="No payroll periods" description="Create a period before generating payroll runs." />
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {periods.map((period) => {
              const displayStatus = normalizePeriodStatus(period.status);
              return (
                <PeriodCardRow
                  key={period.id}
                  period={period}
                  canUpdate={canUpdate}
                  canCalculate={canCalculate}
                  canCancel={canCancel}
                  displayStatus={displayStatus}
                  onEdit={() => { setForm({ start_date: period.start_date, end_date: period.end_date, salary_payment_date: period.salary_payment_date ?? "" }); setModal({ type: "edit", period }); }}
                  onGenerate={() => { setForm({}); setModal({ type: "generate", period }); }}
                  onCancel={() => { setForm({ reason: "" }); setModal({ type: "cancel", period }); }}
                />
              );
            })}
          </div>
        )}
      </Panel>
      {modal ? <PeriodModal modal={modal} form={form} setForm={setForm} onClose={() => { setModal(null); setForm({}); }} onSubmit={() => void submitModal()} /> : null}
    </PageShell>
  );
}

function PeriodModal({ modal, form, setForm, onClose, onSubmit }: { modal: { type: "create" | "edit" | "generate" | "cancel"; period?: PayrollPeriod }; form: Record<string, string>; setForm: (value: Record<string, string>) => void; onClose: () => void; onSubmit: () => void }) {
  const title = modal.type === "create" ? "Create payroll period" : modal.type === "edit" ? "Edit payroll period" : modal.type === "generate" ? "Generate payroll run" : "Cancel payroll period";
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{modal.period ? `${modal.period.period_month}/${modal.period.period_year}` : "Payroll Core period setup"}</p></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {modal.type === "create" ? <><Input value={form.period_month ?? ""} onChange={(event) => update("period_month", event.target.value)} placeholder="Month" /><Input value={form.period_year ?? ""} onChange={(event) => update("period_year", event.target.value)} placeholder="Year" /></> : null}
          {modal.type === "create" || modal.type === "edit" ? <><Input type="date" value={form.start_date ?? ""} onChange={(event) => update("start_date", event.target.value)} aria-label="Start date" /><Input type="date" value={form.end_date ?? ""} onChange={(event) => update("end_date", event.target.value)} aria-label="End date" /><Input type="date" value={form.salary_payment_date ?? ""} onChange={(event) => update("salary_payment_date", event.target.value)} aria-label="Salary payment date" className="md:col-span-2" /></> : null}
          {modal.type === "generate" ? <p className="md:col-span-2 text-sm text-slate-700">Generate a Payroll Core run. The run will calculate, then move to Ready for review.</p> : null}
          {modal.type === "cancel" ? <Input className="md:col-span-2" value={form.reason ?? ""} onChange={(event) => update("reason", event.target.value)} placeholder="Cancellation reason" /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSubmit}>Confirm</Button></div>
      </div>
    </div>
  );
}
