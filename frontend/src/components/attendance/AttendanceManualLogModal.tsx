import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { AttendanceLog } from "../../types/attendance";
import type { Employee } from "../../types/employees";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SelectField } from "../ui/page-shell";

const logTypes: AttendanceLog["log_type"][] = ["IN", "OUT", "BREAK_IN", "BREAK_OUT", "UNKNOWN"];

export function AttendanceManualLogModal(props: {
  token: string;
  employees: Employee[];
  log?: AttendanceLog | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState(props.log?.employee_id ?? "");
  const [logTime, setLogTime] = useState(props.log?.log_time?.slice(0, 16) ?? new Date().toISOString().slice(0, 16));
  const [logType, setLogType] = useState<AttendanceLog["log_type"]>(props.log?.log_type ?? "IN");
  const [notes, setNotes] = useState(props.log?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: Partial<AttendanceLog> = {
        employee_id: employeeId,
        log_time: logTime,
        log_type: logType,
        source: "MANUAL",
        notes: notes || null
      };
      if (props.log) await api.updateAttendanceLog(props.token, props.log.id, input);
      else await api.createManualAttendanceLog(props.token, input);
      await props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save attendance log.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">{props.log ? "Edit Manual Attendance Log" : "Create Manual Attendance Log"}</h2>
          <p className="text-sm text-muted-foreground">Manual punch entries are audited and can refresh the employee daily record.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Field label="Employee">
            <SelectField value={employeeId} onValueChange={setEmployeeId} required>
              <option value="">Select employee</option>
              {props.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name ?? employee.full_name} ({employee.employee_no})</option>)}
            </SelectField>
          </Field>
          <Field label="Log time"><Input type="datetime-local" value={logTime} onChange={(event) => setLogTime(event.target.value)} required /></Field>
          <Field label="Punch type">
            <SelectField value={logType} onValueChange={(value) => setLogType(value as AttendanceLog["log_type"])}>
              {logTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Reason / notes"><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Required when manual entry reasons are enabled" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save log"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
