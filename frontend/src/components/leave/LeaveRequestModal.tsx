import { useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { Employee } from "../../types/employees";
import type { LeaveRequest, LeaveType } from "../../types/leave";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

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
  const [saving, setSaving] = useState(false);
  const days = useMemo(() => estimateDays(form.start_date, form.end_date, form.half_day_type), [form]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.createLeaveRequest(token, form);
      await onSaved(result.request);
      onClose();
    } catch (err) {
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
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.employee_id} disabled={Boolean(employeeId)} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_no}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.leave_type_id} onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}>
              {leaveTypes.filter((type) => Boolean(type.is_active)).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </div>
          <Field label="Start date" type="date" value={form.start_date} onChange={(value) => setForm({ ...form, start_date: value })} />
          <Field label="End date" type="date" value={form.end_date} onChange={(value) => setForm({ ...form, end_date: value })} />
          <div className="space-y-1.5">
            <Label>Half day</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.half_day_type} onChange={(event) => setForm({ ...form, half_day_type: event.target.value as LeaveRequestForm["half_day_type"] })}>
              <option value="NONE">None</option>
              <option value="FIRST_HALF">First half</option>
              <option value="SECOND_HALF">Second half</option>
            </select>
          </div>
          <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">Estimated requested days</p><p className="text-lg font-semibold">{days}</p></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Reason</Label><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div>
        </div>
        {error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Create draft"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
