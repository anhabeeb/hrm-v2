import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { DOCUMENTS_NAV_ITEMS } from "./documentsNav";
import type { DocumentRenewalCase } from "../types/documents";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function statusTone(status: string) {
  if (status === "COMPLETED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED" || status === "WAIVED") return { bg: "#F7F7FB", text: "#6B6F86" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "WAITING_FOR_HR", "WAITING_FOR_EXTERNAL_AUTHORITY", "DOCUMENT_RECEIVED"];

export function DocumentsCompliancePage() {
  const { token } = useAuth();
  const [cases, setCases] = useState<DocumentRenewalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailCase, setDetailCase] = useState<DocumentRenewalCase | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listDocumentRenewalCases(token, {});
      setCases(result.renewal_cases.filter((c) => ACTIVE_STATUSES.includes(c.status)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load compliance cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={DOCUMENTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-lg font-medium text-slate-950">Compliance</p>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : cases.length ? (
            <div className="flex flex-col gap-2">
              {cases.map((renewalCase) => {
                const color = colorFor(renewalCase.employee_name ?? "?");
                const tone = statusTone(renewalCase.status);
                return (
                  <Panel key={renewalCase.id} className="flex items-center gap-3.5 p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(renewalCase.employee_name ?? "?")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{renewalCase.employee_name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {renewalCase.document_type_name} {humanizeTechnicalLabel(renewalCase.case_type).toLowerCase()} · Case {renewalCase.renewal_case_number}{renewalCase.due_date ? ` · Due ${renewalCase.due_date}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{humanizeTechnicalLabel(renewalCase.status)}</span>
                    <Button size="sm" variant="outline" onClick={() => setDetailCase(renewalCase)}>Follow up</Button>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No renewal cases in progress" description="Document renewal cases will appear here as they open." /></Panel>
          )}
        </div>
      </div>

      {detailCase ? <CaseDetailDialog renewalCase={detailCase} onClose={() => setDetailCase(null)} onChanged={() => { setDetailCase(null); void load(); }} /> : null}
    </PageShell>
  );
}

function CaseDetailDialog({ renewalCase, onClose, onChanged }: { renewalCase: DocumentRenewalCase; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.listDocumentRenewalCaseEvents(token, renewalCase.id).then((res) => setEvents(res.events ?? [])).finally(() => setLoading(false));
  }, [token, renewalCase.id]);

  async function act(action: "mark-in-progress" | "mark-waiting" | "complete" | "cancel") {
    if (!token) return;
    setBusy(true);
    try {
      await api.documentRenewalCaseAction(token, renewalCase.id, action);
      alerts.showSuccess("Case updated", `The renewal case was updated.`);
      onChanged();
    } catch (err) {
      alerts.showApiError(err, "Unable to update renewal case");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{renewalCase.employee_name} — {renewalCase.document_type_name}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-muted-foreground">Case</p><p className="mt-0.5 font-medium text-slate-950">{renewalCase.renewal_case_number}</p></div>
            <div><p className="text-muted-foreground">Priority</p><p className="mt-0.5 font-medium text-slate-950">{humanizeTechnicalLabel(renewalCase.priority)}</p></div>
            <div><p className="text-muted-foreground">Current expiry</p><p className="mt-0.5 font-medium text-slate-950">{renewalCase.current_expiry_date ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Due date</p><p className="mt-0.5 font-medium text-slate-950">{renewalCase.due_date ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Assigned to</p><p className="mt-0.5 font-medium text-slate-950">{renewalCase.assigned_to_name ?? "Unassigned"}</p></div>
            <div><p className="text-muted-foreground">Status</p><p className="mt-0.5 font-medium text-slate-950">{humanizeTechnicalLabel(renewalCase.status)}</p></div>
          </div>
          {renewalCase.notes ? <div className="mt-3"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-0.5 text-xs text-slate-950">{renewalCase.notes}</p></div> : null}
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-950">History</p>
            {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : events.length ? (
              <div className="space-y-1.5">
                {events.map((event, i) => (
                  <div key={i} className="rounded-md bg-[#F7F7FB] px-2.5 py-1.5 text-xs text-slate-950">{String(event.action ?? event.event_type ?? "Updated")}{event.created_at ? ` — ${String(event.created_at).slice(0, 10)}` : ""}</div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No history recorded.</p>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {renewalCase.status !== "IN_PROGRESS" ? <Button size="sm" variant="outline" loading={busy} onClick={() => void act("mark-in-progress")}>Mark in progress</Button> : null}
          <Button size="sm" variant="actionSave" loading={busy} onClick={() => void act("complete")}>Mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
