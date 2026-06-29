import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateDateRange, validateRequiredFields, type ValidationIssue } from "../../lib/form-validation";
import type { Employee } from "../../types/employees";
import type { LeaveRequest, LeaveType } from "../../types/leave";
import { useAlert } from "../alerts/useAlert";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedReasonField, ValidatedSelectField, ValidatedTextField } from "../forms/validated-fields";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { SelectField } from "../ui/page-shell";

type LeaveRequestForm = {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day_type: NonNullable<LeaveRequest["half_day_type"]>;
  reason: string;
};

function estimateDays(start: string, end: string, half: string) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  const days = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  return days === 1 && half !== "NONE" ? 0.5 : days;
}

function validateLeaveRequestForm(form: LeaveRequestForm): ValidationIssue[] {
  return [
    ...validateRequiredFields(form as unknown as Record<string, unknown>, {
      employee_id: "Employee",
      leave_type_id: "Leave type",
      start_date: "Start date",
      end_date: "End date"
    }),
    ...validateDateRange({ start: form.start_date, end: form.end_date, startField: "start_date", endField: "end_date", label: "End date" })
  ];
}

export function LeaveRequestModal({
  token,
  employees,
  leaveTypes,
  employeeId,
  onClose,
  onSaved
}: {
  token: string;
  employees: Employee[];
  leaveTypes: LeaveType[];
  employeeId?: string;
  onClose: () => void;
  onSaved: (request: LeaveRequest) => Promise<void> | void;
}) {
  const [form, setForm] = useState<LeaveRequestForm>({
    employee_id: employeeId ?? employees[0]?.id ?? "",
    leave_type_id: leaveTypes.find((type) => Boolean(type.is_active))?.id ?? leaveTypes[0]?.id ?? "",
    start_date: "",
    end_date: "",
    half_day_type: "NONE",
    reason: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const validation = useFormValidation();
  const alerts = useAlert();
  const days = useMemo(() => estimateDays(form.start_date, form.end_date, form.half_day_type), [form]);

  useEffect(() => {
    let cancelled = false;
    if (!form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    api.calculateLeaveRequest(token, form)
      .then((result) => { if (!cancelled) { setPreview(result); setPreviewError(null); } })
      .catch((err) => { if (!cancelled) { setPreview(null); setPreviewError(err instanceof ApiError ? err.message : "Unable to calculate leave preview."); } });
    return () => { cancelled = true; };
  }, [token, form.employee_id, form.leave_type_id, form.start_date, form.end_date, form.half_day_type]);

  async function submit() {
    const issues = validateLeaveRequestForm(form);
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      alerts.showValidationError(issues, "Leave request needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.createLeaveRequest(token, form);
      await onSaved(result.request);
      alerts.showSuccess("Leave request created", "The request was saved and is ready for review.");
      onClose();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Leave request cannot be submitted");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Leave request failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to create leave request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><h2 className="text-sm font-semibold">Create leave request</h2><p className="text-xs text-muted-foreground">Document and salary impact are evaluated by the selected policy.</p></div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="px-4 pt-4"><FormErrorSummary issues={validation.issues} /></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <ValidatedSelectField field="employee_id" label="Employee" value={form.employee_id} disabled={Boolean(employeeId)} issues={validation.issues} onValueChange={(employee_id) => setForm({ ...form, employee_id })}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_no}</option>)}</ValidatedSelectField>
          <ValidatedSelectField field="leave_type_id" label="Leave type" value={form.leave_type_id} issues={validation.issues} onValueChange={(leave_type_id) => setForm({ ...form, leave_type_id })}>{leaveTypes.filter((type) => Boolean(type.is_active)).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</ValidatedSelectField>
          <ValidatedTextField field="start_date" label="Start date" type="date" value={form.start_date} issues={validation.issues} onChange={(value) => setForm({ ...form, start_date: value })} />
          <ValidatedTextField field="end_date" label="End date" type="date" value={form.end_date} issues={validation.issues} onChange={(value) => setForm({ ...form, end_date: value })} />
          <div className="space-y-1.5">
            <Label>Half day</Label>
            <SelectField value={form.half_day_type} onValueChange={(half_day_type) => setForm({ ...form, half_day_type: half_day_type as LeaveRequestForm["half_day_type"] })}>
              <option value="NONE">None</option>
              <option value="FIRST_HALF">First half</option>
              <option value="SECOND_HALF">Second half</option>
            </SelectField>
          </div>
          <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">Estimated requested days</p><p className="text-lg font-semibold">{days}</p></div>
          <div className="md:col-span-2"><ValidatedReasonField value={form.reason} issues={validation.issues} onChange={(reason) => setForm({ ...form, reason })} /></div>
          <ApprovalPreview preview={preview} error={previewError} />
        </div>
        {error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} loadingLabel="Creating leave draft" onClick={() => void submit()}>Create draft</Button>
        </div>
      </div>
    </div>
  );
}

function ApprovalPreview({ preview, error }: { preview: Record<string, unknown> | null; error: string | null }) {
  const chain = preview?.approval_chain_preview as { steps?: Array<Record<string, unknown>> } | undefined;
  const payroll = preview?.payroll_impact as Record<string, unknown> | undefined;
  if (error) return <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div>;
  if (!preview) return <div className="md:col-span-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">Choose employee, leave type, and dates to preview balance, payroll, document, and approval impact.</div>;
  return (
    <div className="md:col-span-2 rounded-md border">
      <div className="border-b px-3 py-2 text-sm font-semibold">Approval and impact preview</div>
      <div className="grid gap-2 p-3 text-sm md:grid-cols-3">
        <div><span className="text-muted-foreground">Chargeable days</span><div className="font-medium">{String(preview.chargeable_days ?? preview.requested_days ?? "-")}</div></div>
        <div><span className="text-muted-foreground">Document</span><div className="font-medium">{preview.document_required ? "Required" : "Not required"}</div></div>
        <div><span className="text-muted-foreground">Payroll impact</span><div className="font-medium">{String(payroll?.mode ?? "NONE")}</div></div>
      </div>
      <div className="border-t px-3 py-2">
        {(chain?.steps ?? []).length ? (chain?.steps ?? []).map((step) => (
          <div key={`${step.step_order}-${step.step_name}`} className="flex items-center justify-between gap-3 py-1 text-sm">
            <span>{String(step.step_order)}. {String(step.step_name)} <span className="text-muted-foreground">({String(step.approver_type)})</span></span>
            <span className={step.warning ? "text-amber-700" : "text-emerald-700"}>{step.warning ? String(step.warning) : step.approver_user_id ? "Resolved" : "Configured"}</span>
          </div>
        )) : <div className="text-sm text-muted-foreground">No approval steps resolved yet.</div>}
      </div>
    </div>
  );
}


