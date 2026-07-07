import { useEffect, useState } from "react";
import { CalendarRange, ChevronRight, Plus } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollPeriod } from "../types/payroll";

function statusTone(status: string) {
  if (status === "OPEN") return { bg: "#FAEEDA", text: "#854F0B" };
  if (status === "CLOSED") return { bg: "#EAF3DE", text: "#27500A" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

function monthLabel(p: PayrollPeriod) {
  return new Date(Date.UTC(p.period_year, p.period_month - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function PayrollPeriodsPage() {
  const { token, user } = useAuth();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("payroll.periods.manage") || permissions.has("payroll.manage");

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.listPayrollPeriods(token, {});
      setPeriods(result.periods ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Periods</p>
              <p className="mt-0.5 text-xs text-muted-foreground">The monthly payroll calendar — each period can hold multiple runs</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Open new period</Button> : null}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : periods.length ? (
            <div className="flex flex-col gap-2">
              {periods.map((p) => (
                <Panel key={p.id} className="flex items-center gap-4 p-3.5">
                  <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-[#EEEDFE]"><CalendarRange className="h-4 w-4 text-[#26215C]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{monthLabel(p)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{p.start_date} – {p.end_date}{p.salary_payment_date ? ` · Payment date ${p.salary_payment_date}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(p.status).bg, color: statusTone(p.status).text }}>{humanizeTechnicalLabel(p.status)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No payroll periods yet" description="Open a new period to start scheduling payroll runs." /></Panel>
          )}
        </div>
      </div>
      {newOpen ? <NewPeriodModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
    </PageShell>
  );
}

function NewPeriodModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(daysInMonth)}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.createPayrollPeriod(token, { period_month: month, period_year: year, start_date: startDate, end_date: endDate });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open period.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Open new payroll period</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Open period</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
