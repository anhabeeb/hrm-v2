import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SelectField, TextareaField } from "../ui/page-shell";
import type { RosterAssignment, RosterAssignmentStatus, ShiftTemplate } from "../../types/roster";

type AssignmentForm = Pick<RosterAssignment, "shift_template_id" | "custom_start_time" | "custom_end_time" | "break_minutes" | "status" | "notes"> & { reason?: string };

const statuses: RosterAssignmentStatus[] = ["UNASSIGNED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "SCHEDULED", "DAY_OFF", "OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT", "CANCELLED", "ABSENT_PLACEHOLDER"];

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

  async function submit() {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
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
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <Field label="Status">
            <SelectField value={form.status} onValueChange={(status) => setForm({ ...form, status: status as RosterAssignmentStatus })}>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </SelectField>
          </Field>
          <Field label="Shift template">
            <SelectField value={form.shift_template_id ?? ""} onValueChange={(value) => setForm({ ...form, shift_template_id: value || null, status: value ? "DRAFT" : form.status })}>
              <option value="">No template</option>
              {shiftTemplates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}
            </SelectField>
          </Field>
          <Field label="Custom start"><Input type="time" value={form.custom_start_time ?? ""} onChange={(event) => setForm({ ...form, custom_start_time: event.target.value || null })} /></Field>
          <Field label="Custom end"><Input type="time" value={form.custom_end_time ?? ""} onChange={(event) => setForm({ ...form, custom_end_time: event.target.value || null })} /></Field>
          <Field label="Break minutes"><Input type="number" min="0" value={form.break_minutes ?? ""} onChange={(event) => setForm({ ...form, break_minutes: event.target.value ? Number(event.target.value) : null })} /></Field>
          <Field label="Reason">
            <Input value={form.reason ?? ""} required={requireReason} placeholder={requireReason ? "Required for published roster edits" : "Optional"} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </Field>
          <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value || null })} /></div>
        </div>
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
