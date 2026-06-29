import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceCorrectionModal } from "../components/attendance/AttendanceCorrectionModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceCorrection } from "../types/attendance";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

function tone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING" || status === "SUBMITTED") return "warning" as const;
  if (status === "CANCELLED") return "neutral" as const;
  return "danger" as const;
}

function parseSnapshot(value?: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function AttendanceCorrectionsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("attendance.corrections.view") || permissions.has("attendance.corrections.review") || permissions.has("attendance.view") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const canCorrect = permissions.has("attendance.corrections.create") || permissions.has("attendance.correct") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const canApprove = permissions.has("attendance.corrections.approve") || permissions.has("attendance.approve_correction") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const canReject = permissions.has("attendance.corrections.reject") || permissions.has("attendance.approve_correction") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const canCancel = permissions.has("attendance.corrections.cancel") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage") || canCorrect;
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<{ correction: AttendanceCorrection; type: "approve" | "reject" | "cancel" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [attendanceDisabled, setAttendanceDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({ search, status, department_id: departmentId, location_id: locationId, date_from: dateFrom, date_to: dateTo }), [search, status, departmentId, locationId, dateFrom, dateTo]);
  const dateRange = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(departmentId ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? departmentId, onRemove: () => setDepartmentId("") }] : []),
    ...(locationId ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? locationId, onRemove: () => setLocationId("") }] : []),
    ...(dateFrom || dateTo ? [{ key: "date", label: "Date", value: formatDateRangeLabel(dateRange), onRemove: () => { setDateFrom(""); setDateTo(""); } }] : [])
  ], [dateFrom, dateRange, dateTo, departmentId, departments, locationId, locations, search, status]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setAttendanceDisabled(false);
      const [correctionResult, employeeResult, departmentResult, locationResult] = await Promise.all([
        api.listAttendanceCorrections(token, filters),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setCorrections(correctionResult.corrections);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ATTENDANCE_MODULE_DISABLED") {
        setAttendanceDisabled(true);
        setCorrections([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load correction requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  async function action(correction: AttendanceCorrection, type: "approve" | "reject" | "cancel", note?: string | null) {
    if (!token) return;
    try {
      if (type === "approve") await api.approveAttendanceCorrection(token, correction.id, note ?? null);
      if (type === "reject") await api.rejectAttendanceCorrection(token, correction.id, note ?? "");
      if (type === "cancel") await api.cancelAttendanceCorrection(token, correction.id, note ?? null);
      setReviewAction(null);
      setReviewNote("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update correction request.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Attendance corrections unavailable" description="Your account needs attendance correction view permission." /></Panel></PageShell>;
  if (attendanceDisabled) return <PageShell><PageHeader title="Attendance Corrections" description="Attendance module is disabled." /><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Correction lists and review actions are hidden until an administrator enables attendance." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Attendance Corrections"
        description="Missed punch and status correction approval workflow foundation."
        actions={
          <>
          <ExportMenu
            moduleName="Attendance corrections"
            rows={corrections as unknown as Record<string, unknown>[]}
            columns={["employee_no", "employee_name", "department_name", "location_name", "attendance_date", "requested_status", "status", "reason", "requested_by_name", "reviewed_by_name"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          {canCorrect ? <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New correction</Button> : null}
          </>
        }
      />
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee" />}
            reset={<FilterResetButton onReset={() => { setSearch(""); setStatus(""); setDepartmentId(""); setLocationId(""); setDateFrom(""); setDateTo(""); }} />}
            moreFilters={
              <MoreFiltersSheet onReset={() => { setDepartmentId(""); setLocationId(""); }}>
                <OrganizationCascadeSelector
                  value={{ locationId, departmentId }}
                  onChange={(next) => {
                    setLocationId(next.locationId ?? "");
                    setDepartmentId(next.departmentId ?? "");
                  }}
                  departments={departments}
                  locations={locations}
                  jobLevels={[]}
                  positions={[]}
                  includeLocation
                  includeJobLevel={false}
                  includePosition={false}
                  mode="report-filter"
                  labels={{ locationId: "Location", departmentId: "Department" }}
                  className="grid gap-2"
                />
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((item) => ({ value: item, label: item }))} />
            <StandardDateRangeFilter value={dateRange} onChange={(range) => { setDateFrom(range.from ?? ""); setDateTo(range.to ?? ""); }} label="Date Range" />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Current</TableHead><TableHead>Requested changes</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Requested by</TableHead><TableHead>Reviewed by</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{corrections.map((correction) => {
              const current = parseSnapshot(correction.current_values_json);
              const pending = correction.status === "PENDING" || correction.status === "SUBMITTED";
              return <TableRow key={correction.id}>
                <TableCell><EmployeeIdentityCell employeeId={correction.employee_id} employeeName={correction.employee_name ?? "-"} employeeNumber={correction.employee_no ?? ""} departmentName={correction.department_name} locationName={correction.location_name} size="sm" /></TableCell>
                <TableCell>{correction.attendance_date}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{String(current.status ?? "-")} · {String(current.first_clock_in ?? "-")} / {String(current.last_clock_out ?? "-")}</TableCell>
                <TableCell>{correction.requested_status ?? "-"} · {correction.requested_clock_in ? new Date(correction.requested_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {correction.requested_clock_out ? new Date(correction.requested_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                <TableCell className="max-w-64 truncate">{correction.reason}</TableCell>
                <TableCell><Badge tone={tone(correction.status)}>{correction.status}</Badge></TableCell>
                <TableCell>{correction.requested_by_name ?? "-"}</TableCell>
                <TableCell>{correction.reviewed_by_name ?? "-"}</TableCell>
                <TableCell><div className="flex justify-end gap-1">{pending && canApprove ? <RowActionButton intent="approve" title="Approve" onClick={() => setReviewAction({ correction, type: "approve" })}><Check className="h-4 w-4" /></RowActionButton> : null}{pending && canReject ? <RowActionButton intent="reject" title="Reject" onClick={() => setReviewAction({ correction, type: "reject" })}><X className="h-4 w-4" /></RowActionButton> : null}{pending && canCancel ? <RowActionButton intent="delete" title="Cancel" onClick={() => setReviewAction({ correction, type: "cancel" })}><X className="h-4 w-4 text-red-600" /></RowActionButton> : null}</div></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading corrections" description="Fetching correction requests." /> : corrections.length === 0 ? <EmptyState title="No correction requests found" description="Submit a correction request or adjust filters." /> : null}
      </Panel>
      {modalOpen && token ? <AttendanceCorrectionModal token={token} employees={employees} onClose={() => setModalOpen(false)} onSaved={load} /> : null}
      {reviewAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-white shadow-xl">
            <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">{reviewAction.type === "approve" ? "Approve Correction" : reviewAction.type === "reject" ? "Reject Correction" : "Cancel Correction"}</h2><p className="text-sm text-muted-foreground">{reviewAction.correction.employee_name} · {reviewAction.correction.attendance_date}</p></div>
            <div className="space-y-2 p-4">
              <Input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={reviewAction.type === "approve" ? "Review note optional" : "Reason required"} />
              {reviewAction.type !== "approve" && !reviewNote ? <p className="text-xs text-red-600">A reason is required.</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" onClick={() => setReviewAction(null)}>Cancel</Button><Button onClick={() => void action(reviewAction.correction, reviewAction.type, reviewNote)} disabled={reviewAction.type !== "approve" && !reviewNote}>Confirm</Button></div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
