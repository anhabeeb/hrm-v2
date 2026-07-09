import { useEffect, useMemo, useState } from "react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { DOCUMENTS_NAV_ITEMS } from "./documentsNav";
import type { DocumentComplianceDashboard, DocumentExpiryAlert, DocumentRenewalCase, DocumentRequirementWaiver } from "../types/documents";

type Mode = "dashboard" | "missing" | "expiring" | "expired" | "alerts" | "renewal-cases" | "waivers";

const TITLES: Record<Mode, { title: string; description: string }> = {
  dashboard: { title: "Compliance", description: "Company-wide document compliance snapshot" },
  missing: { title: "Missing", description: "Employees missing a required document" },
  expiring: { title: "Expiring", description: "Documents approaching their expiry date" },
  expired: { title: "Expired", description: "Documents that have already expired" },
  alerts: { title: "Alerts", description: "Expiry alerts awaiting acknowledgement or resolution" },
  "renewal-cases": { title: "Renewal cases", description: "Active document renewal workflow cases" },
  waivers: { title: "Waivers", description: "Requirement waivers granted to employees" }
};

const STATUS_OPTIONS = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "COMPLETED", "CANCELLED", "ACTIVE"];

function tone(status?: string) {
  if (!status) return { bg: "#F7F7FB", text: "#6B6F86" };
  if (["COMPLIANT", "RESOLVED", "COMPLETED", "VALID"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (["EXPIRING_SOON", "OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "WAITING_FOR_HR"].includes(status)) return { bg: "#FAEEDA", text: "#854F0B" };
  if (["EXPIRED_DOCUMENTS", "EXPIRED", "URGENT_EXPIRING", "MISSING_REQUIRED", "CRITICAL", "CANCELLED", "DISMISSED"].includes(status)) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

function StatusPill({ value }: { value?: string | null }) {
  if (!value) return null;
  const t = tone(value);
  return <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: t.bg, color: t.text }}>{humanizeTechnicalLabel(value)}</span>;
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function DocumentsCompliancePage({ mode = "dashboard" }: { mode?: Mode }) {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("documents.compliance.view") || permissions.has("documents.view") || permissions.has("reports.documents.view");
  const canManage = permissions.has("documents.compliance.manage") || permissions.has("documents.alerts.manage") || permissions.has("documents.renewal_cases.manage");

  const [dashboard, setDashboard] = useState<DocumentComplianceDashboard | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [alertRows, setAlertRows] = useState<DocumentExpiryAlert[]>([]);
  const [cases, setCases] = useState<DocumentRenewalCase[]>([]);
  const [waivers, setWaivers] = useState<DocumentRequirementWaiver[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reasonAction, setReasonAction] = useState<{ title: string; required?: boolean; onConfirm: (reason: string) => Promise<void> } | null>(null);

  const filters = useMemo(() => ({ search, status: status === "all" ? undefined : status }), [search, status]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      if (mode === "dashboard") setDashboard(await api.getDocumentComplianceDashboard(token));
      else if (mode === "missing") setRows((await api.listDocumentComplianceMissing(token, filters)).rows ?? []);
      else if (mode === "expiring") setRows((await api.listDocumentComplianceExpiring(token, filters)).rows ?? []);
      else if (mode === "expired") setRows((await api.listDocumentComplianceExpired(token, filters)).rows ?? []);
      else if (mode === "alerts") setAlertRows((await api.listDocumentAlerts(token, filters)).alerts);
      else if (mode === "renewal-cases") setCases((await api.listDocumentRenewalCases(token, filters)).renewal_cases);
      else if (mode === "waivers") setWaivers((await api.listDocumentRequirementWaivers(token, filters)).waivers);
    } catch (err) {
      alerts.showApiError(err, "Unable to load document compliance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView, mode, filters]);

  async function refreshAll() {
    if (!token) return;
    try {
      await api.refreshDocumentCompliance(token);
      alerts.showSuccess("Compliance refreshed", "Document compliance snapshots, alerts, and renewal cases were refreshed.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to refresh compliance.");
    }
  }

  async function alertAction(row: DocumentExpiryAlert, action: "acknowledge" | "resolve" | "dismiss", reason = "") {
    if (!token) return;
    try {
      await api.documentAlertAction(token, row.id, action, reason);
      alerts.showSuccess("Alert updated", `Document alert ${action} completed.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update document alert.");
    }
  }

  async function caseAction(row: DocumentRenewalCase, action: "mark-in-progress" | "mark-waiting" | "complete" | "cancel", reason = "") {
    if (!token) return;
    try {
      await api.documentRenewalCaseAction(token, row.id, action, { reason, note: reason });
      alerts.showSuccess("Renewal case updated", `Renewal case ${action.replace("mark-", "")} completed.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update renewal case.");
    }
  }

  async function cancelWaiver(row: DocumentRequirementWaiver, reason: string) {
    if (!token) return;
    await api.cancelDocumentRequirementWaiver(token, row.id, reason);
    alerts.showSuccess("Waiver cancelled", "The document requirement waiver was cancelled.");
    await load();
  }

  const exportRows = mode === "alerts" ? alertRows as unknown as Record<string, unknown>[] : mode === "renewal-cases" ? cases as unknown as Record<string, unknown>[] : mode === "waivers" ? waivers as unknown as Record<string, unknown>[] : rows;
  const exportColumns = mode === "alerts" ? ["employee_no", "employee_name", "document_type_name", "alert_type", "severity", "status", "due_date", "expiry_date"]
    : mode === "renewal-cases" ? ["renewal_case_number", "employee_no", "employee_name", "document_type_name", "case_type", "status", "priority", "due_date", "assigned_to_name"]
    : mode === "waivers" ? ["employee_no", "employee_name", "document_type_name", "waiver_reason", "waiver_start_date", "waiver_end_date", "status"]
    : ["employee_name", "employee_no", "department_name", "location_name", "document_type_name", "expiry_date", "days_until_expiry", "status"];

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={DOCUMENTS_NAV_ITEMS} moduleLabel="Documents" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Document compliance unavailable" description="Your account needs document compliance permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={DOCUMENTS_NAV_ITEMS} moduleLabel="Documents" />
                <p className="mt-0.5 text-xs text-muted-foreground">{TITLES[mode].description}</p>
              </div>
              <div className="flex items-center gap-2">
              <ExportMenu variant="plain" moduleName={`Document compliance ${mode}`} rows={exportRows} columns={exportColumns} />
              {canManage ? <Button size="sm" variant="outline" onClick={() => void refreshAll()}>Refresh compliance</Button> : null}
</div>

              </div>

              <Panel className="shadow-none space-y-3 p-4">

          {mode !== "dashboard" ? (
            <Panel className="flex flex-wrap items-center gap-3.5 p-3">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee or document" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={status} onValueChange={setStatus}>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
              </SelectField>
            </Panel>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : mode === "dashboard" ? (
            <DashboardView dashboard={dashboard} />
          ) : ["missing", "expiring", "expired"].includes(mode) ? (
            rows.length ? (
              <div className="flex flex-col gap-2">
                {rows.map((row, index) => (
                  <Panel key={`${String(row.id ?? row.employee_id)}-${index}`} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{asText(row.employee_name ?? row.full_name)} <span className="font-normal text-muted-foreground">{asText(row.employee_no)}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{asText(row.department_name)} · {asText(row.location_name)} · {asText(row.document_type_name)}{row.document_number ? ` · Doc# ${asText(row.document_number)}` : ""}{row.expiry_date ? ` · Expires ${asText(row.expiry_date)}` : ""}{row.days_until_expiry != null ? ` · ${asText(row.days_until_expiry)} days` : ""}{row.reason ? ` · ${asText(row.reason)}` : ""}</p>
                    </div>
                    <StatusPill value={String(row.status ?? row.display_status ?? row.requirement_status ?? "")} />
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No rows found" description="No records match this view." /></Panel>
          ) : mode === "alerts" ? (
            alertRows.length ? (
              <div className="flex flex-col gap-2">
                {alertRows.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{row.employee_no}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{row.restricted ? "Restricted document" : row.document_type_name ?? "-"} · {humanizeTechnicalLabel(row.alert_type)}{row.due_date ? ` · Due ${row.due_date}` : ""}{row.expiry_date ? ` · Expires ${row.expiry_date}` : ""}{row.notes ? ` · ${row.notes}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusPill value={row.severity} />
                      <StatusPill value={row.status} />
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {canManage && row.status === "OPEN" ? <RowActionButton intent="neutral" size="sm" title="Acknowledge" onClick={() => void alertAction(row, "acknowledge")}>Ack</RowActionButton> : null}
                      {canManage && row.status !== "RESOLVED" ? <RowActionButton intent="approve" size="sm" title="Resolve" onClick={() => setReasonAction({ title: "Resolve alert", onConfirm: (reason) => alertAction(row, "resolve", reason) })}>Resolve</RowActionButton> : null}
                      {canManage && row.status !== "DISMISSED" ? <RowActionButton intent="warning" size="sm" title="Dismiss" onClick={() => setReasonAction({ title: "Dismiss alert", onConfirm: (reason) => alertAction(row, "dismiss", reason) })}>Dismiss</RowActionButton> : null}
                    </div>
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No alerts" description="There are no matching document alerts." /></Panel>
          ) : mode === "renewal-cases" ? (
            cases.length ? (
              <div className="flex flex-col gap-2">
                {cases.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{row.employee_no}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Case {row.renewal_case_number} · {row.document_type_name ?? "-"} · {humanizeTechnicalLabel(row.case_type)} · Priority {humanizeTechnicalLabel(row.priority)}{row.due_date ? ` · Due ${row.due_date}` : ""}{row.assigned_to_name ? ` · Assigned ${row.assigned_to_name}` : ""}</p>
                    </div>
                    <StatusPill value={row.status} />
                    <div className="flex shrink-0 gap-1.5">
                      {canManage && row.status === "OPEN" ? <RowActionButton intent="create" size="sm" title="Start" onClick={() => void caseAction(row, "mark-in-progress")}>Start</RowActionButton> : null}
                      {canManage && row.status !== "COMPLETED" ? <RowActionButton intent="warning" size="sm" title="Waiting" onClick={() => void caseAction(row, "mark-waiting")}>Waiting</RowActionButton> : null}
                      {canManage && row.status !== "COMPLETED" ? <RowActionButton intent="approve" size="sm" title="Complete" onClick={() => void caseAction(row, "complete")}>Complete</RowActionButton> : null}
                      {canManage && row.status !== "CANCELLED" ? <RowActionButton intent="delete" size="sm" title="Cancel" onClick={() => setReasonAction({ title: "Cancel renewal case", required: true, onConfirm: (reason) => caseAction(row, "cancel", reason) })}>Cancel</RowActionButton> : null}
                    </div>
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No renewal cases" description="Expiry and missing document workflows will appear here." /></Panel>
          ) : (
            waivers.length ? (
              <div className="flex flex-col gap-2">
                {waivers.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{row.employee_no}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{row.document_type_name ?? row.document_type_code ?? "-"} · {row.waiver_reason} · {row.waiver_start_date} - {row.waiver_end_date ?? "Ongoing"}</p>
                    </div>
                    <StatusPill value={row.status} />
                    {canManage && row.status === "ACTIVE" ? <RowActionButton intent="delete" size="sm" title="Cancel waiver" onClick={() => setReasonAction({ title: "Cancel waiver", required: true, onConfirm: (reason) => cancelWaiver(row, reason) })}>Cancel</RowActionButton> : null}
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No waivers" description="Waived requirements will appear here." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {reasonAction ? <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} /> : null}
    </PageShell>
  );
}

function DashboardView({ dashboard }: { dashboard: DocumentComplianceDashboard | null }) {
  if (!dashboard) return <Panel><EmptyState title="No dashboard data" description="Refresh compliance to generate the first snapshot." /></Panel>;
  const summary = dashboard.summary ?? {};
  const tiles: Array<[string, number, string]> = [
    ["Employees", summary.employee_count ?? 0, "info"],
    ["Compliant", summary.compliant ?? 0, "success"],
    ["Missing", summary.missing_required ?? 0, "danger"],
    ["Expiring", summary.expiring_soon ?? 0, "warning"],
    ["Urgent", summary.urgent_expiring ?? 0, "danger"],
    ["Expired", summary.expired ?? 0, "danger"],
    ["Waivers", summary.waivers ?? 0, "info"],
    ["Open alerts", summary.open_alerts ?? 0, "warning"]
  ];
  const toneClasses: Record<string, string> = {
    success: "border-[#5DCAA5]/30 bg-[#EAF3DE] text-[#27500A]",
    warning: "border-[#FAC775]/30 bg-[#FAEEDA] text-[#854F0B]",
    danger: "border-[#F09595]/30 bg-[#FCEBEB] text-[#A32D2D]",
    info: "border-[#7FB3E0]/30 bg-[#E6F1FB] text-[#0C447C]"
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, t]) => (
          <Panel key={label} className="p-3">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[t]}`}>{label}</span>
            <p className="mt-2 text-xl font-medium text-slate-950">{value}</p>
          </Panel>
        ))}
      </div>
      {dashboard.alerts?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-950">Recent alerts</p>
          {dashboard.alerts.slice(0, 5).map((row) => (
            <Panel key={row.id} className="flex items-center gap-3.5 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-950">{row.employee_name ?? "-"}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{row.document_type_name ?? "-"} · {humanizeTechnicalLabel(row.alert_type)}</p>
              </div>
              <StatusPill value={row.severity} />
              <StatusPill value={row.status} />
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReasonDialog({ action, onClose }: { action: { title: string; required?: boolean; onConfirm: (reason: string) => Promise<void> }; onClose: () => void }) {
  const alerts = useAlert();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (action.required && !reason.trim()) { setError("A reason is required."); return; }
    setBusy(true);
    try {
      await action.onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to complete action.");
      alerts.showApiError(err, "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{action.title}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-1.5"><Label>{action.required ? "Reason (required)" : "Note (optional)"}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} onClick={() => void submit()}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
