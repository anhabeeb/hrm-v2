import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { AttendanceRecord, AttendanceStatus } from "../../types/attendance";
import type { Employee } from "../../types/employees";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CheckboxField, SelectField } from "../ui/page-shell";

const statusOptions: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED"];

export function AttendanceRecordModal(props: {
  token: string;
  employees: Employee[];
  record?: AttendanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(props.record?.employee_id ?? "");
  const [date, setDate] = useState(props.record?.attendance_date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<AttendanceStatus>(props.record?.status ?? "PRESENT");
  const [clockIn, setClockIn] = useState(props.record?.first_clock_in?.slice(0, 16) ?? "");
  const [clockOut, setClockOut] = useState(props.record?.last_clock_out?.slice(0, 16) ?? "");
  const [workMinutes, setWorkMinutes] = useState(String(props.record?.total_work_minutes ?? ""));
  const [lateMinutes, setLateMinutes] = useState(String(props.record?.late_minutes ?? ""));
  const [earlyMinutes, setEarlyMinutes] = useState(String(props.record?.early_checkout_minutes ?? ""));
  const [missedPunch, setMissedPunch] = useState(Boolean(props.record?.missed_punch));
  const [notes, setNotes] = useState(props.record?.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: Partial<AttendanceRecord> & { reason?: string } = {
        employee_id: employeeId,
        attendance_date: date,
        status,
        first_clock_in: clockIn || null,
        last_clock_out: clockOut || null,
        total_work_minutes: workMinutes === "" ? null : Number(workMinutes),
        late_minutes: lateMinutes === "" ? null : Number(lateMinutes),
        early_checkout_minutes: earlyMinutes === "" ? null : Number(earlyMinutes),
        missed_punch: missedPunch,
        notes: notes || null,
        reason: props.record ? reason : undefined
      };
      if (props.record) await api.updateAttendanceRecord(props.token, props.record.id, input);
      else await api.createAttendanceRecord(props.token, input);
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save attendance record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">{props.record ? "Edit Attendance Record" : "Create Attendance Record"}</h2>
          <p className="text-sm text-muted-foreground">Manual corrections are audited and kept separate from device raw logs.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Field label="Employee">
            <SelectField value={employeeId} disabled={Boolean(props.record)} onValueChange={setEmployeeId} required>
              <option value="">Select employee</option>
              {props.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name ?? employee.full_name} ({employee.employee_no})</option>)}
            </SelectField>
          </Field>
          <Field label="Attendance date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
          <Field label="Status">
            <SelectField value={status} onValueChange={(value) => setStatus(value as AttendanceStatus)}>
              {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Clock in"><Input type="datetime-local" value={clockIn} onChange={(event) => setClockIn(event.target.value)} /></Field>
          <Field label="Clock out"><Input type="datetime-local" value={clockOut} onChange={(event) => setClockOut(event.target.value)} /></Field>
          <Field label="Work minutes"><Input type="number" min="0" value={workMinutes} onChange={(event) => setWorkMinutes(event.target.value)} /></Field>
          <Field label="Late minutes"><Input type="number" min="0" value={lateMinutes} onChange={(event) => setLateMinutes(event.target.value)} /></Field>
          <Field label="Early checkout minutes"><Input type="number" min="0" value={earlyMinutes} onChange={(event) => setEarlyMinutes(event.target.value)} /></Field>
          <CheckboxField label="Missed punch" checked={missedPunch} onChange={setMissedPunch} />
          <Field label="Notes"><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          {props.record ? <div className="space-y-1.5 md:col-span-2"><Label>Reason for change</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Required for audited attendance edits" /></div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save record"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
