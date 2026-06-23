import { CalendarPlus, Edit, PlayCircle, Search, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollPeriod } from "../types/payroll";

const statuses = ["", "DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"];

function normalizePeriodStatus(status: string) {
  if (status === "OPEN") return "DRAFT";
  if (status === "PROCESSING") return "CALCULATING";
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID" || status === "CLOSED") return "FINALIZED_PLACEHOLDER";
  return status;
}

function statusTone(status: string) {
  const normalized = normalizePeriodStatus(status);
  if (normalized === "FINALIZED_PLACEHOLDER" || normalized === "LOCKED") return "success" as const;
  if (normalized === "CANCELLED") return "danger" as const;
  if (normalized === "CALCULATING" || normalized === "READY_FOR_REVIEW") return "warning" as const;
  return "neutral" as const;
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
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ type: "create" | "edit" | "generate" | "cancel"; period?: PayrollPeriod } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const filters = useMemo(() => ({ year, month, status, search }), [year, month, status, search]);

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

  if (!canView) return <Panel><EmptyState title="Payroll periods unavailable" description="Your account needs payroll.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Payroll Periods</h1><p className="text-sm text-muted-foreground">Create month-end payroll windows and generate runs.</p></div>
        <div className="flex flex-wrap gap-2"><PayrollNav />{canCreate ? <Button size="sm" onClick={() => { setForm({ period_month: String(new Date().getMonth() + 1), period_year: String(new Date().getFullYear()) }); setModal({ type: "create" }); }}><CalendarPlus className="h-4 w-4" /> Create period</Button> : null}</div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search period" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Input value={year} onChange={(event) => setYear(event.target.value)} placeholder="Year" />
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}><option value="">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item || "all"} value={item}>{item || "All statuses"}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Month/year</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Payment date</TableHead><TableHead>Status</TableHead><TableHead>Created by</TableHead><TableHead>Approved</TableHead><TableHead>Paid</TableHead><TableHead>Closed</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{periods.map((period) => {
              const displayStatus = normalizePeriodStatus(period.status);
              return <TableRow key={period.id}><TableCell className="font-medium">{period.period_month}/{period.period_year}</TableCell><TableCell>{period.start_date}</TableCell><TableCell>{period.end_date}</TableCell><TableCell>{period.salary_payment_date ?? "-"}</TableCell><TableCell><Badge tone={statusTone(period.status)}>{displayStatus}</Badge></TableCell><TableCell>{period.created_by_name ?? "-"}</TableCell><TableCell>{period.approved_at ?? "-"}</TableCell><TableCell>{period.paid_at ?? "-"}</TableCell><TableCell>{period.closed_at ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/payroll/runs?period_id=${period.id}`}><Button title="Open runs" variant="ghost" size="icon"><Search className="h-4 w-4" /></Button></Link>{canUpdate ? <Button title="Edit period" variant="ghost" size="icon" onClick={() => { setForm({ start_date: period.start_date, end_date: period.end_date, salary_payment_date: period.salary_payment_date ?? "" }); setModal({ type: "edit", period }); }}><Edit className="h-4 w-4" /></Button> : null}{canCalculate ? <Button title="Generate run" variant="ghost" size="icon" onClick={() => { setForm({}); setModal({ type: "generate", period }); }}><PlayCircle className="h-4 w-4" /></Button> : null}{canCancel && !["FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"].includes(displayStatus) ? <Button title="Cancel period" variant="ghost" size="icon" onClick={() => { setForm({ reason: "" }); setModal({ type: "cancel", period }); }}><XCircle className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading payroll periods" description="Fetching period rows." /> : periods.length === 0 ? <EmptyState title="No payroll periods" description="Create a period before generating payroll runs." /> : null}
      </Panel>
      {modal ? <PeriodModal modal={modal} form={form} setForm={setForm} onClose={() => { setModal(null); setForm({}); }} onSubmit={() => void submitModal()} /> : null}
    </div>
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
          {modal.type === "generate" ? <p className="md:col-span-2 text-sm text-slate-700">Generate a Payroll Core run. The run will calculate, then move to READY_FOR_REVIEW.</p> : null}
          {modal.type === "cancel" ? <Input className="md:col-span-2" value={form.reason ?? ""} onChange={(event) => update("reason", event.target.value)} placeholder="Cancellation reason" /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSubmit}>Confirm</Button></div>
      </div>
    </div>
  );
}
