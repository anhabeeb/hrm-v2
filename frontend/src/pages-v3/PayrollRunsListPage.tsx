import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollPeriod, PayrollRun } from "../types/payroll";

function statusTone(status: string) {
  if (status === "PAID" || status === "FINALIZED") return { bg: "#EAF3DE", text: "#27500A" };
  if (["SUBMITTED_FOR_APPROVAL", "APPROVED", "APPROVED_PLACEHOLDER"].includes(status)) return { bg: "#E6F1FB", text: "#0C447C" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

function formatCurrency(value?: number | null) {
  if (value === undefined || value === null) return "MVR 0";
  return `MVR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function monthLabel(run: PayrollRun) {
  if (!run.period_month || !run.period_year) return "Payroll period";
  return new Date(Date.UTC(run.period_year, run.period_month - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function PayrollRunsListPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRunOpen, setNewRunOpen] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canGenerate = permissions.has("payroll.runs.manage") || permissions.has("payroll.manage");

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listPayrollRuns(token, {});
      setRuns(result.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payroll runs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(
    () => runs.filter((r) => String(r.period_year) === year).filter((r) => status === "all" || r.status === status),
    [runs, status, year]
  );
  const nextRun = filtered.find((r) => r.status === "DRAFT" || r.status === "REVIEW") ?? filtered[0];
  const totalCost = filtered.reduce((sum, r) => sum + (r.net_salary_total ?? 0), 0);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Payroll runs</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Click a run to review before finalizing</p>
            </div>
            {canGenerate ? <Button size="sm" onClick={() => setNewRunOpen(true)}><Plus className="h-4 w-4" /> Start new run</Button> : null}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Next run</p><p className="mt-1 text-sm font-medium text-slate-950">{nextRun ? monthLabel(nextRun) : "Not set"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Est. total cost</p><p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(totalCost)}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Pending advances</p><p className="mt-1 text-sm font-medium text-[#854F0B]">—</p></Panel>
          </div>

          <Panel className="flex flex-wrap items-center gap-3.5 p-3">
            <select className="bg-transparent text-xs text-muted-foreground outline-none" value={year} onChange={(e) => setYear(e.target.value)}>
              {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
            <select className="bg-transparent text-xs text-muted-foreground outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {["DRAFT", "REVIEW", "SUBMITTED_FOR_APPROVAL", "APPROVED", "FINALIZED", "PAID"].map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
            </select>
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((run) => {
                const tone = statusTone(run.status);
                return (
                  <Panel key={run.id} className="flex cursor-pointer items-center gap-4 p-3.5 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/v3-preview/payroll/runs/${run.id}`)}>
                    <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-[#EEEDFE]"><CalendarClock className="h-4 w-4 text-[#26215C]" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{monthLabel(run)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{run.employee_count ?? 0} employees · Run #{run.run_no}</p>
                    </div>
                    <p className="text-xs font-medium text-slate-950">{formatCurrency(run.net_salary_total)}</p>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{humanizeTechnicalLabel(run.status)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No payroll runs found" description="Adjust filters or start a new run for this period." /></Panel>
          )}
        </div>
      </div>

      {newRunOpen ? <NewRunModal onClose={() => setNewRunOpen(false)} onCreated={(id) => { setNewRunOpen(false); navigate(`/v3-preview/payroll/runs/${id}`); }} /> : null}
    </PageShell>
  );
}

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (runId: string) => void }) {
  const { token } = useAuth();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listPayrollPeriods(token, {}).then((res) => {
      setPeriods(res.periods ?? []);
      setPeriodId(res.periods?.[0]?.id ?? "");
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  async function submit() {
    if (!token || !periodId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.generatePayrollRun(token, { payroll_period_id: periodId });
      onCreated(result.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start payroll run.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Start new payroll run</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading available periods…</p>
          ) : periods.length ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-950">Payroll period</label>
              <SelectField value={periodId} onValueChange={setPeriodId}>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.period_month}/{p.period_year}</option>)}
              </SelectField>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No open payroll periods without a run yet. <Link to="/payroll/periods" className="text-primary hover:underline">Create one first</Link>.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!periodId} onClick={() => void submit()}>Generate run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
