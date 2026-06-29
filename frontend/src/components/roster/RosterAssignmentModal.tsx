import { useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateDateRange, validateRequiredField, type ValidationIssue } from "../../lib/form-validation";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedReasonField, ValidatedSelectField, ValidatedTextField } from "../forms/validated-fields";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { TextareaField } from "../ui/page-shell";
import type { RosterAssignment, RosterAssignmentStatus, ShiftTemplate } from "../../types/roster";

type AssignmentForm = Pick<RosterAssignment, "shift_template_id" | "custom_start_time" | "custom_end_time" | "break_minutes" | "status" | "notes"> & { reason?: string };

const statuses: RosterAssignmentStatus[] = ["UNASSIGNED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "SCHEDULED", "DAY_OFF", "OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT", "CANCELLED", "ABSENT_PLACEHOLDER"];

function validateRosterAssignmentForm(form: AssignmentForm, requireReason?: boolean): ValidationIssue[] {
  return [
    ...validateRequiredField(form.status, "status", "Status"),
    ...validateRequiredField(form.shift_template_id, "shift_template_id", "Shift template"),
    ...(requireReason ? validateRequiredField(form.reason, "reason", "Reason") : []),
    ...validateDateRange({ start: form.custom_start_time ?? "", end: form.custom_end_time ?? "", startField: "custom_start_time", endField: "custom_end_time", label: "Custom end time" })
  ];
}

export function RosterAssignmentModal({
  title,
  subtitle,
  assignment,
  shiftTemplates,
  requireReason,
  onClose,
  onSave
}: {
  title: string;
  subtitle: string;
  assignment?: Partial<RosterAssignment> | null;
  shiftTemplates: ShiftTemplate[];
  requireReason?: boolean;
  onClose: () => void;
  onSave: (input: AssignmentForm) => Promise<void> | void;
}) {
  const [form, setForm] = useState<AssignmentForm>({
    shift_template_id: assignment?.shift_template_id ?? null,
    custom_start_time: assignment?.custom_start_time ?? null,
    custom_end_time: assignment?.custom_end_time ?? null,
    break_minutes: assignment?.break_minutes ?? null,
    status: assignment?.status ?? "UNASSIGNED",
    notes: assignment?.notes ?? null,
    reason: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();

  async function submit() {
    const issues = validateRosterAssignmentForm(form, requireReason);
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      }
      setError(err instanceof ApiError ? err.message : "Unable to save roster assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="px-4 pt-4"><FormErrorSummary issues={validation.issues} /></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <ValidatedSelectField field="status" label="Status" value={form.status ?? ""} issues={validation.issues} onValueChange={(status) => setForm({ ...form, status: status as RosterAssignmentStatus })}>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </ValidatedSelectField>
          <ValidatedSelectField field="shift_template_id" label="Shift template" value={form.shift_template_id ?? ""} issues={validation.issues} onValueChange={(value) => setForm({ ...form, shift_template_id: value || null, status: value ? "DRAFT" : form.status })}>
              <option value="">No template</option>
              {shiftTemplates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}
          </ValidatedSelectField>
          <ValidatedTextField field="custom_start_time" label="Custom start" type="time" value={form.custom_start_time ?? ""} issues={validation.issues} onChange={(value) => setForm({ ...form, custom_start_time: value || null })} />
          <ValidatedTextField field="custom_end_time" label="Custom end" type="time" value={form.custom_end_time ?? ""} issues={validation.issues} onChange={(value) => setForm({ ...form, custom_end_time: value || null })} />
          <Field label="Break minutes"><Input type="number" min="0" value={form.break_minutes ?? ""} onChange={(event) => setForm({ ...form, break_minutes: event.target.value ? Number(event.target.value) : null })} /></Field>
          <ValidatedReasonField required={requireReason} value={form.reason ?? ""} issues={validation.issues} placeholder={requireReason ? "Required for published roster edits" : "Optional"} onChange={(reason) => setForm({ ...form, reason })} />
          <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value || null })} /></div>
        </div>
        {error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving || (requireReason && !form.reason)} onClick={() => void submit()}>{saving ? "Saving..." : "Save assignment"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
