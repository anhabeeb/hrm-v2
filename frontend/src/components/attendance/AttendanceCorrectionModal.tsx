import type { FormEvent } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { AttendanceStatus } from "../../types/attendance";
import type { Employee } from "../../types/employees";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const statusOptions: Array<"" | AttendanceStatus> = ["", "PRESENT", "ABSENT", "LEAVE", "SICK", "LATE", "HALF_DAY", "OFF_DAY", "HOLIDAY"];

export function AttendanceCorrectionModal(props: {
  token: string;
  employees: Employee[];
  employeeId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(props.employeeId ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [status, setStatus] = useState<"" | AttendanceStatus>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createAttendanceCorrection(props.token, {
        employee_id: employeeId,
        attendance_date: date,
        requested_clock_in: clockIn || null,
        requested_clock_out: clockOut || null,
        requested_status: status || null,
        reason
      });
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit correction request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Request Attendance Correction</h2>
          <p className="text-sm text-muted-foreground">Corrections require review before payroll-facing attendance is changed.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="space-y-1.5 md:col-span-2">
            <Label>Employee</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={employeeId} disabled={Boolean(props.employeeId)} onChange={(event) => setEmployeeId(event.target.value)} required>
              <option value="">Select employee</option>
              {props.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name ?? employee.full_name} ({employee.employee_no})</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Attendance date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
          <div className="space-y-1.5">
            <Label>Requested status</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "" | AttendanceStatus)}>
              <option value="">No status change</option>
              {statusOptions.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Requested clock in</Label><Input type="datetime-local" value={clockIn} onChange={(event) => setClockIn(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Requested clock out</Label><Input type="datetime-local" value={clockOut} onChange={(event) => setClockOut(event.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Reason</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} required /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit request"}</Button>
        </div>
      </form>
    </div>
  );
}
