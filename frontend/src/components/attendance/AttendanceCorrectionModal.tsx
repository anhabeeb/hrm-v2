import type { FormEvent } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateDateField, validateDateRange, validateRequiredField, type ValidationIssue } from "../../lib/form-validation";
import type { AttendanceStatus } from "../../types/attendance";
import type { Employee } from "../../types/employees";
import { useOrganizationReferences } from "../../hooks/useOrganizationReferences";
import { useAlert } from "../alerts/useAlert";
import { EmployeeCascadeSelect } from "../organization/EmployeeCascadeSelect";
import { FieldError } from "../forms/FieldError";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedReasonField, ValidatedSelectField, ValidatedTextField } from "../forms/validated-fields";
import { Button } from "../ui/button";

const statusOptions: Array<"" | AttendanceStatus> = ["", "PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "CORRECTED"];

function validateAttendanceCorrectionForm(input: { employeeId: string; date: string; status: string; reason: string; clockIn: string; clockOut: string }): ValidationIssue[] {
  return [
    ...validateRequiredField(input.employeeId, "employee_id", "Employee"),
    ...validateRequiredField(input.date, "attendance_date", "Correction date"),
    ...validateRequiredField(input.status, "requested_status", "Requested status"),
    ...validateRequiredField(input.reason, "reason", "Reason"),
    ...validateDateField(input.date, "attendance_date", "Correction date"),
    ...validateDateRange({ start: input.clockIn, end: input.clockOut, startField: "requested_clock_in", endField: "requested_clock_out", label: "Requested clock out" })
  ];
}

export function AttendanceCorrectionModal(props: {
  token: string;
  employees: Employee[];
  employeeId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const organizationRefs = useOrganizationReferences(props.token);
  const [employeeId, setEmployeeId] = useState(props.employeeId ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [status, setStatus] = useState<"" | AttendanceStatus>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const validation = useFormValidation();
  const alerts = useAlert();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const issues = validateAttendanceCorrectionForm({ employeeId, date, status, reason, clockIn, clockOut });
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      alerts.showValidationError(issues, "Attendance correction needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
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
      alerts.showSuccess("Attendance correction submitted", "The request was sent for review.");
      props.onClose();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Attendance correction cannot be submitted");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Attendance correction failed");
      }
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
          <div className="md:col-span-2"><FormErrorSummary issues={validation.issues} /></div>
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="md:col-span-2">
            <EmployeeCascadeSelect
              employees={props.employees}
              departments={organizationRefs.departments}
              locations={organizationRefs.locations}
              jobLevels={organizationRefs.jobLevels}
              positions={organizationRefs.positions}
              value={employeeId}
              onChange={setEmployeeId}
              disabled={Boolean(props.employeeId)}
              mode="report-filter"
            />
            <FieldError issues={validation.fieldIssues("employee_id")} />
          </div>
          <ValidatedTextField field="attendance_date" label="Attendance date" type="date" value={date} issues={validation.issues} required onChange={setDate} />
          <ValidatedSelectField field="requested_status" label="Requested status" value={status} issues={validation.issues} onValueChange={(value) => setStatus(value as "" | AttendanceStatus)}>
              <option value="">No status change</option>
              {statusOptions.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
          </ValidatedSelectField>
          <ValidatedTextField field="requested_clock_in" label="Requested clock in" type="datetime-local" value={clockIn} issues={validation.issues} onChange={setClockIn} />
          <ValidatedTextField field="requested_clock_out" label="Requested clock out" type="datetime-local" value={clockOut} issues={validation.issues} onChange={setClockOut} />
          <div className="md:col-span-2"><ValidatedReasonField required value={reason} issues={validation.issues} onChange={setReason} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" type="button" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit request"}</Button>
        </div>
      </form>
    </div>
  );
}
