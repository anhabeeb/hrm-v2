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

const statuses = ["", "OPEN", "PROCESSING", "REVIEW", "APPROVED", "PAID", "CLOSED", "CANCELLED"];

export function PayrollPeriodsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const canManage = permissions.has("payroll.manage");
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  async function createPeriod() {
    if (!token) return;
    const periodMonth = Number(window.prompt("Payroll month (1-12)", String(new Date().getMonth() + 1)));
    const periodYear = Number(window.prompt("Payroll year", String(new Date().getFullYear())));
    if (!periodMonth || !periodYear) return;
    try {
      await api.createPayrollPeriod(token, { period_month: periodMonth, period_year: periodYear });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create payroll period.");
    }
  }

  async function editPeriod(period: PayrollPeriod) {
    if (!token) return;
    const paymentDate = window.prompt("Salary payment date (YYYY-MM-DD, blank for none)", period.salary_payment_date ?? "");
    if (paymentDate === null) return;
    try {
      await api.updatePayrollPeriod(token, period.id, { salary_payment_date: paymentDate || null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update payroll period.");
    }
  }

  async function generateRun(period: PayrollPeriod) {
    if (!token || !window.confirm(`Generate payroll run for ${period.period_month}/${period.period_year}?`)) return;
    try {
      await api.generatePayrollRun(token, { payroll_period_id: period.id });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to generate payroll run.");
    }
  }

  async function cancelPeriod(period: PayrollPeriod) {
    if (!token) return;
    const reason = window.prompt("Reason for cancelling this payroll period");
    if (!reason) return;
    try {
      await api.cancelPayrollPeriod(token, period.id, reason);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel payroll period.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Payroll periods unavailable" description="Your account needs payroll.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Payroll Periods</h1><p className="text-sm text-muted-foreground">Create month-end payroll windows and generate runs.</p></div>
        <div className="flex flex-wrap gap-2"><PayrollNav />{canManage ? <Button size="sm" onClick={() => void createPeriod()}><CalendarPlus className="h-4 w-4" /> Create period</Button> : null}</div>
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
            <TableBody>{periods.map((period) => <TableRow key={period.id}><TableCell className="font-medium">{period.period_month}/{period.period_year}</TableCell><TableCell>{period.start_date}</TableCell><TableCell>{period.end_date}</TableCell><TableCell>{period.salary_payment_date ?? "-"}</TableCell><TableCell><Badge tone={period.status === "PAID" ? "success" : period.status === "CANCELLED" ? "danger" : "neutral"}>{period.status}</Badge></TableCell><TableCell>{period.created_by_name ?? "-"}</TableCell><TableCell>{period.approved_at ?? "-"}</TableCell><TableCell>{period.paid_at ?? "-"}</TableCell><TableCell>{period.closed_at ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/payroll/runs?period_id=${period.id}`}><Button title="Open runs" variant="ghost" size="icon"><Search className="h-4 w-4" /></Button></Link>{canManage ? <Button title="Edit period" variant="ghost" size="icon" onClick={() => void editPeriod(period)}><Edit className="h-4 w-4" /></Button> : null}{canManage ? <Button title="Generate run" variant="ghost" size="icon" onClick={() => void generateRun(period)}><PlayCircle className="h-4 w-4" /></Button> : null}{canManage && !["PAID", "CLOSED", "CANCELLED"].includes(period.status) ? <Button title="Cancel period" variant="ghost" size="icon" onClick={() => void cancelPeriod(period)}><XCircle className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading payroll periods" description="Fetching period rows." /> : periods.length === 0 ? <EmptyState title="No payroll periods" description="Create a period before generating payroll runs." /> : null}
      </Panel>
    </div>
  );
}
