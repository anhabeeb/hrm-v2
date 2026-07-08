import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { CustomDeductionTemplate, EmployeeCustomDeduction } from "../types/payroll";
import type { Employee } from "../types/employees";

function money(value: unknown) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function tone(value: string) {
  if (["ACTIVE", "APPROVED", "COMPLETED"].includes(value)) return { bg: "#EAF3DE", text: "#27500A" };
  if (["PAUSED", "PENDING_APPROVAL", "DRAFT"].includes(value)) return { bg: "#FAEEDA", text: "#854F0B" };
  if (["CANCELLED", "REJECTED", "ARCHIVED"].includes(value)) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

function StatusPill({ value }: { value: string }) {
  const t = tone(value);
  return <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: t.bg, color: t.text }}>{humanizeTechnicalLabel(value)}</span>;
}

interface ReportRow { [key: string]: unknown }

function ReportTable({ title, rows, columns }: { title: string; rows: ReportRow[]; columns: string[] }) {
  return (
    <Panel className="overflow-hidden p-0">
      <p className="border-b px-4 py-2.5 text-xs font-medium text-slate-950">{title}</p>
      <div className="themed-scroll overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-[#F7F7FB] text-left text-muted-foreground">
              {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{humanizeTechnicalLabel(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {columns.map((c) => <td key={c} className="whitespace-nowrap px-3 py-2 text-slate-950">{typeof row[c] === "number" ? Number(row[c]).toLocaleString() : String(row[c] ?? "-")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-4 text-center text-xs text-muted-foreground">No data yet.</p> : null}
      </div>
    </Panel>
  );
}

export function PayrollCustomDeductionsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManageTemplates = permissions.has("payroll.custom_deduction_templates.manage") || permissions.has("payroll.custom_deduction_templates.create") || permissions.has("payroll.custom_deduction_templates.update");
  const canManageAssignments = permissions.has("payroll.employee_custom_deductions.manage") || permissions.has("payroll.employee_custom_deductions.create") || permissions.has("employees.custom_deductions.manage");
  const canApproveAssignments = permissions.has("payroll.employee_custom_deductions.approve") || permissions.has("payroll.employee_custom_deductions.manage");

  const [templates, setTemplates] = useState<CustomDeductionTemplate[]>([]);
  const [deductions, setDeductions] = useState<EmployeeCustomDeduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<ReportRow[]>([]);
  const [byTemplate, setByTemplate] = useState<ReportRow[]>([]);
  const [byCategory, setByCategory] = useState<ReportRow[]>([]);
  const [shortfalls, setShortfalls] = useState<ReportRow[]>([]);
  const [applications, setApplications] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateForm, setTemplateForm] = useState<Partial<CustomDeductionTemplate> | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<{ employee_id: string; template_id: string; assigned_amount: string; total_amount: string; installment_count: string; effective_from: string; effective_to: string; reason: string; notes: string } | null>(null);
  const [actionForm, setActionForm] = useState<{ id: string; action: "approve" | "reject" | "pause" | "resume" | "cancel"; reason: string } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [templateRes, deductionRes, employeeRes, summaryRes, templateReport, categoryReport, shortfallReport, appReport] = await Promise.all([
        api.listCustomDeductionTemplates(token, true),
        api.listPayrollCustomDeductions(token),
        api.listEmployees(token, { limit: 500 }),
        api.getCustomDeductionSummaryReport(token),
        api.getCustomDeductionsByTemplateReport(token),
        api.getCustomDeductionsByCategoryReport(token),
        api.getCustomDeductionShortfallsReport(token),
        api.getCustomDeductionApplicationsReport(token)
      ]);
      setTemplates(templateRes.templates);
      setDeductions(deductionRes.deductions);
      setEmployees(employeeRes.employees);
      setSummary(summaryRes.reports as ReportRow[]);
      setByTemplate(templateReport.reports as ReportRow[]);
      setByCategory(categoryReport.reports as ReportRow[]);
      setShortfalls(shortfallReport.reports as ReportRow[]);
      setApplications(appReport.reports as unknown as ReportRow[]);
    } catch (err) {
      alerts.showApiError(err, "Unable to load custom deductions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function saveTemplate() {
    if (!token || !templateForm) return;
    try {
      if (templateForm.id) await api.updateCustomDeductionTemplate(token, templateForm.id, templateForm);
      else await api.createCustomDeductionTemplate(token, templateForm);
      alerts.showSuccess("Template saved", "Custom deduction template was saved.");
      setTemplateForm(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save custom deduction template.");
    }
  }

  async function archiveTemplate(template: CustomDeductionTemplate) {
    if (!token) return;
    try {
      await api.archiveCustomDeductionTemplate(token, template.id);
      alerts.showSuccess("Template archived", `${template.name} was archived.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to archive template.");
    }
  }

  async function saveAssignment() {
    if (!token || !assignmentForm) return;
    try {
      await api.createEmployeeCustomDeduction(token, assignmentForm.employee_id, {
        template_id: assignmentForm.template_id,
        assigned_amount: assignmentForm.assigned_amount ? Number(assignmentForm.assigned_amount) : null,
        total_amount: assignmentForm.total_amount ? Number(assignmentForm.total_amount) : null,
        installment_count: assignmentForm.installment_count ? Number(assignmentForm.installment_count) : null,
        effective_from: assignmentForm.effective_from,
        effective_to: assignmentForm.effective_to || null,
        reason: assignmentForm.reason,
        notes: assignmentForm.notes || null
      });
      alerts.showSuccess("Deduction assigned", "The custom deduction was assigned to the employee.");
      setAssignmentForm(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to assign custom deduction.");
    }
  }

  async function runAction() {
    if (!token || !actionForm) return;
    try {
      await api.customDeductionAction(token, actionForm.id, actionForm.action, actionForm.reason || undefined);
      alerts.showSuccess("Deduction updated", `Custom deduction ${actionForm.action} completed.`);
      setActionForm(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update custom deduction.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-lg font-medium text-slate-950">Custom deductions</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Configurable deduction templates, employee assignments, and payroll application history</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Templates</p>
              {canManageTemplates ? <Button size="sm" onClick={() => setTemplateForm({ category: "OTHER", deduction_type: "ONE_TIME", amount_type: "FIXED_AMOUNT", default_recurrence_interval: "MONTHLY", default_priority_number: 3, show_on_payslip: true, show_in_self_service: true, require_approval: true, include_in_final_settlement: true, status: "ACTIVE" })}><Plus className="h-4 w-4" /> Add template</Button> : null}
            </div>
            {loading ? (
              <Panel className="h-16 animate-pulse" />
            ) : templates.length ? (
              <div className="flex flex-col gap-2">
                {templates.map((t) => (
                  <Panel key={t.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{t.name} <span className="font-mono font-normal text-muted-foreground">{t.code}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{t.category} · {humanizeTechnicalLabel(t.deduction_type)} · {t.amount_type === "PERCENTAGE_OF_BASIC" || t.amount_type === "PERCENTAGE_OF_GROSS" ? `${t.default_percentage ?? 0}%` : money(t.default_amount)}{Boolean(t.require_approval) ? " · Requires approval" : ""}</p>
                    </div>
                    <StatusPill value={t.status} />
                    {canManageTemplates ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit template" onClick={() => setTemplateForm(t)}>Edit</RowActionButton>
                        {t.status !== "ARCHIVED" ? <RowActionButton intent="archive" size="sm" title="Archive template" onClick={() => void archiveTemplate(t)}>Archive</RowActionButton> : null}
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : (
              <Panel><EmptyState title="No custom deduction templates configured" description="Add a template to start assigning custom deductions." /></Panel>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Employee assignments</p>
              {canManageAssignments ? <Button size="sm" onClick={() => setAssignmentForm({ employee_id: employees[0]?.id ?? "", template_id: templates.find((t) => t.status === "ACTIVE")?.id ?? "", assigned_amount: "", total_amount: "", installment_count: "", effective_from: new Date().toISOString().slice(0, 10), effective_to: "", reason: "", notes: "" })}><Plus className="h-4 w-4" /> Assign deduction</Button> : null}
            </div>
            {loading ? (
              <Panel className="h-16 animate-pulse" />
            ) : deductions.length ? (
              <div className="flex flex-col gap-2">
                {deductions.map((d) => (
                  <Panel key={d.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{d.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{d.employee_no}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{d.template_name_snapshot} · {money(d.assigned_amount)}{d.total_amount != null ? ` of ${money(d.total_amount)}` : ""} · Remaining {money(d.remaining_balance)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusPill value={d.approval_status} />
                      <StatusPill value={d.status} />
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {canApproveAssignments && d.approval_status === "PENDING_APPROVAL" ? <RowActionButton intent="approve" size="sm" title="Approve assignment" onClick={() => setActionForm({ id: d.id, action: "approve", reason: "" })}>Approve</RowActionButton> : null}
                      {canApproveAssignments && d.approval_status === "PENDING_APPROVAL" ? <RowActionButton intent="reject" size="sm" title="Reject assignment" onClick={() => setActionForm({ id: d.id, action: "reject", reason: "" })}>Reject</RowActionButton> : null}
                      {canManageAssignments && d.status === "ACTIVE" ? <RowActionButton intent="hold" size="sm" title="Pause assignment" onClick={() => setActionForm({ id: d.id, action: "pause", reason: "" })}>Pause</RowActionButton> : null}
                      {canManageAssignments && d.status === "PAUSED" ? <RowActionButton intent="release" size="sm" title="Resume assignment" onClick={() => setActionForm({ id: d.id, action: "resume", reason: "" })}>Resume</RowActionButton> : null}
                      {canManageAssignments && !["CANCELLED", "COMPLETED", "ARCHIVED"].includes(d.status) ? <RowActionButton intent="delete" size="sm" title="Cancel assignment" onClick={() => setActionForm({ id: d.id, action: "cancel", reason: "" })}>Cancel</RowActionButton> : null}
                    </div>
                  </Panel>
                ))}
              </div>
            ) : (
              <Panel><EmptyState title="No employee custom deduction assignments yet" description="Assign a template to an employee to get started." /></Panel>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-950">Reports</p>
            <div className="grid gap-3 xl:grid-cols-2">
              <ReportTable title="Application summary" rows={summary} columns={["application_status", "application_count", "scheduled_amount", "deducted_amount", "shortfall_amount"]} />
              <ReportTable title="Shortfalls and warnings" rows={shortfalls} columns={["employee_no", "employee_name", "template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount"]} />
              <ReportTable title="By template" rows={byTemplate} columns={["template_code_snapshot", "template_name_snapshot", "assignment_count", "deducted_amount", "remaining_balance"]} />
              <ReportTable title="By category" rows={byCategory} columns={["category_snapshot", "assignment_count", "deducted_amount", "remaining_balance"]} />
            </div>
            <ReportTable title="Payroll application history" rows={applications} columns={["employee_no", "employee_name", "template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "application_status"]} />
          </div>
        </div>
      </div>

      {templateForm ? <TemplateModal value={templateForm} onChange={setTemplateForm} onClose={() => setTemplateForm(null)} onSave={() => void saveTemplate()} /> : null}
      {assignmentForm ? <AssignmentModal value={assignmentForm} employees={employees} templates={templates.filter((t) => t.status === "ACTIVE")} onChange={setAssignmentForm} onClose={() => setAssignmentForm(null)} onSave={() => void saveAssignment()} /> : null}
      {actionForm ? (
        <Dialog open onOpenChange={(v) => !v && setActionForm(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>{actionForm.action[0].toUpperCase()}{actionForm.action.slice(1)} deduction</DialogTitle></DialogHeader>
            <DialogBody>
              <div className="space-y-1.5"><Label>{actionForm.action === "reject" || actionForm.action === "cancel" ? "Reason (required)" : "Note (optional)"}</Label><Input value={actionForm.reason} onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })} /></div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionForm(null)}>Cancel</Button>
              <Button size="sm" disabled={(actionForm.action === "reject" || actionForm.action === "cancel") && !actionForm.reason.trim()} onClick={() => void runAction()}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function TemplateModal({ value, onChange, onClose, onSave }: { value: Partial<CustomDeductionTemplate>; onChange: (v: Partial<CustomDeductionTemplate>) => void; onClose: () => void; onSave: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{value.id ? "Edit custom deduction template" : "Create custom deduction template"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={value.code ?? ""} onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={value.name ?? ""} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Input value={value.category ?? ""} onChange={(e) => onChange({ ...value, category: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><Label>Status</Label><SelectField value={value.status ?? "ACTIVE"} onValueChange={(v) => onChange({ ...value, status: v as CustomDeductionTemplate["status"] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></SelectField></div>
            <div className="space-y-1.5"><Label>Deduction type</Label><SelectField value={value.deduction_type ?? "ONE_TIME"} onValueChange={(v) => onChange({ ...value, deduction_type: v as CustomDeductionTemplate["deduction_type"] })}>{[["ONE_TIME", "One time"], ["RECURRING", "Recurring"], ["INSTALLMENT", "Installment"], ["BALANCE_BASED", "Balance based"], ["FORMULA_PLACEHOLDER", "Formula placeholder"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Amount type</Label><SelectField value={value.amount_type ?? "FIXED_AMOUNT"} onValueChange={(v) => onChange({ ...value, amount_type: v as CustomDeductionTemplate["amount_type"] })}>{[["FIXED_AMOUNT", "Fixed amount"], ["PERCENTAGE_OF_BASIC", "% of basic"], ["PERCENTAGE_OF_GROSS", "% of gross"], ["CUSTOM_FORMULA_PLACEHOLDER", "Formula placeholder"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Default amount</Label><Input type="number" min={0} step="0.01" value={value.default_amount ?? ""} onChange={(e) => onChange({ ...value, default_amount: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="space-y-1.5"><Label>Default percentage</Label><Input type="number" min={0} max={100} step="0.01" value={value.default_percentage ?? ""} onChange={(e) => onChange({ ...value, default_percentage: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="space-y-1.5"><Label>Installment count</Label><Input type="number" min={1} value={value.default_installment_count ?? ""} onChange={(e) => onChange({ ...value, default_installment_count: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="space-y-1.5"><Label>Recurrence</Label><SelectField value={value.default_recurrence_interval ?? "MONTHLY"} onValueChange={(v) => onChange({ ...value, default_recurrence_interval: v })}>{[["MONTHLY", "Monthly"], ["PAYROLL_PERIOD", "Payroll period"], ["WEEKLY_PLACEHOLDER", "Weekly placeholder"], ["CUSTOM_PLACEHOLDER", "Custom placeholder"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" value={value.default_priority_number ?? 3} onChange={(e) => onChange({ ...value, default_priority_number: Number(e.target.value) })} /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Description</Label><Input value={value.description ?? ""} onChange={(e) => onChange({ ...value, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.show_on_payslip)} onChange={(e) => onChange({ ...value, show_on_payslip: e.target.checked })} /> Show on payslip</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.show_in_self_service)} onChange={(e) => onChange({ ...value, show_in_self_service: e.target.checked })} /> Show in self-service</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.require_approval)} onChange={(e) => onChange({ ...value, require_approval: e.target.checked })} /> Require approval</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.require_document)} onChange={(e) => onChange({ ...value, require_document: e.target.checked })} /> Require document</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.include_in_final_settlement)} onChange={(e) => onChange({ ...value, include_in_final_settlement: e.target.checked })} /> Include in final settlement</label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (!value.code?.trim() || !value.name?.trim()) { setError("Code and name are required."); return; } onSave(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssignmentFormValue { employee_id: string; template_id: string; assigned_amount: string; total_amount: string; installment_count: string; effective_from: string; effective_to: string; reason: string; notes: string }

function AssignmentModal({ value, employees, templates, onChange, onClose, onSave }: { value: AssignmentFormValue; employees: Employee[]; templates: CustomDeductionTemplate[]; onChange: (v: AssignmentFormValue) => void; onClose: () => void; onSave: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Assign employee custom deduction</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Employee</Label><SelectField value={value.employee_id} onValueChange={(v) => onChange({ ...value, employee_id: v })}>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</SelectField></div>
            <div className="col-span-2 space-y-1.5"><Label>Template</Label><SelectField value={value.template_id} onValueChange={(v) => onChange({ ...value, template_id: v })}>{templates.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Assigned amount</Label><Input type="number" value={value.assigned_amount} onChange={(e) => onChange({ ...value, assigned_amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Total amount</Label><Input type="number" value={value.total_amount} onChange={(e) => onChange({ ...value, total_amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Installment count</Label><Input type="number" min={1} value={value.installment_count} onChange={(e) => onChange({ ...value, installment_count: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Effective from</Label><Input type="date" value={value.effective_from} onChange={(e) => onChange({ ...value, effective_from: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Effective to</Label><Input type="date" value={value.effective_to} onChange={(e) => onChange({ ...value, effective_to: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (!value.employee_id || !value.template_id || !value.effective_from || !value.reason.trim()) { setError("Employee, template, effective date, and reason are required."); return; } onSave(); }}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
