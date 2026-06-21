import { FileText, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

type Mode = "home" | "profile" | "documents" | "attendance" | "leave" | "payroll" | "assets" | "kyc";
type Row = Record<string, unknown>;

const nav = [
  { mode: "profile", label: "My Profile", to: "/self-service/profile" },
  { mode: "documents", label: "My Documents", to: "/self-service/documents" },
  { mode: "attendance", label: "My Attendance", to: "/self-service/attendance" },
  { mode: "leave", label: "My Leave", to: "/self-service/leave" },
  { mode: "payroll", label: "My Payroll", to: "/self-service/payroll" },
  { mode: "assets", label: "My Assets", to: "/self-service/assets" },
  { mode: "kyc", label: "KYC Requests", to: "/self-service/kyc-requests" }
] as const;

export function SelfServicePage({ mode = "home" }: { mode?: Mode }) {
  const { token } = useAuth();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeMode = mode === "home" ? "profile" : mode;

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const self = await api.getSelfServiceMe(token);
      setLinked(self.linked_employee);
      if (!self.linked_employee) {
        setData(null);
        setMessage(self.unavailable_message ?? "This account is not linked to an employee profile.");
        return;
      }
      if (activeMode === "profile") setData(await api.getSelfServiceProfile(token));
      if (activeMode === "documents") setData(await api.getSelfServiceDocuments(token));
      if (activeMode === "attendance") setData(await api.getSelfServiceAttendance(token));
      if (activeMode === "leave") setData(await api.getSelfServiceLeave(token));
      if (activeMode === "payroll") setData(await api.getSelfServicePayroll(token));
      if (activeMode === "assets") setData(await api.getSelfServiceAssets(token));
      if (activeMode === "kyc") setData(await api.listSelfServiceKycRequests(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Self-service could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, activeMode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Employee Self-Service</h1>
          <p className="text-sm text-muted-foreground">View your own HR records and submit profile update requests.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Panel className="overflow-x-auto p-2">
        <div className="flex min-w-max gap-1">
          {nav.map((item) => (
            <Link
              key={item.mode}
              to={item.to}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                activeMode === item.mode && "bg-muted text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      {message ? (
        <Panel className="p-6 text-sm text-muted-foreground">{message}</Panel>
      ) : (
        <DataTableFrame loading={loading} error={error} empty={!loading && linked === false}>
          {activeMode === "profile" ? <ProfileSection data={data} /> : null}
          {activeMode === "documents" ? <DocumentsSection data={data} /> : null}
          {activeMode === "attendance" ? <AttendanceSection data={data} token={token} reload={load} /> : null}
          {activeMode === "leave" ? <LeaveSection data={data} token={token} reload={load} /> : null}
          {activeMode === "payroll" ? <PayrollSection data={data} /> : null}
          {activeMode === "assets" ? <AssetsSection data={data} /> : null}
          {activeMode === "kyc" ? <KycSection data={data} token={token} reload={load} /> : null}
        </DataTableFrame>
      )}
    </div>
  );
}

function rows(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function ProfileSection({ data }: { data: Record<string, unknown> | null }) {
  const employee = (data?.employee ?? {}) as Row;
  const contacts = rows(data, "contacts");
  const fields: [string, unknown][] = [
    ["Employee no", employee.employee_no],
    ["Name", employee.full_name],
    ["Department", employee.department_name],
    ["Position", employee.position_title],
    ["Outlet/location", employee.location_name],
    ["Job level", employee.job_level_name],
    ["Employee type", employee.employee_type],
    ["Employment type", employee.employment_type],
    ["Joining date", employee.joining_date],
    ["Status", employee.status_name]
  ];
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted text-sm font-semibold">{text(employee.full_name).slice(0, 2).toUpperCase()}</div>
          <div>
            <h2 className="text-base font-semibold">{text(employee.full_name)}</h2>
            <p className="text-sm text-muted-foreground">{text(employee.employee_no)}</p>
          </div>
        </div>
        <Link to="/self-service/kyc-requests"><Button size="sm"><Plus className="h-4 w-4" />Submit update request</Button></Link>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border px-3 py-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium">{text(value)}</p>
          </div>
        ))}
      </div>
      <SimpleTable title="Contact summary" rows={contacts} columns={["contact_type", "value", "relationship", "is_primary"]} />
    </div>
  );
}

function DocumentsSection({ data }: { data: Record<string, unknown> | null }) {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Document uploads are managed by HR/Admin.</div>
      <SimpleTable title="My documents" rows={rows(data, "documents")} columns={["document_type_name", "category_name", "issue_date", "expiry_date", "display_status", "is_sensitive"]} />
    </div>
  );
}

function AttendanceSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [monthData, setMonthData] = useState<Record<string, unknown> | null>(data);
  const [form, setForm] = useState({ attendance_date: "", requested_clock_in: "", requested_clock_out: "", reason: "" });

  useEffect(() => {
    setMonthData(data);
  }, [data]);

  async function loadMonth(value: string) {
    setMonth(value);
    if (!token || !value) return;
    const [year, monthPart] = value.split("-").map(Number);
    const from = `${value}-01`;
    const to = new Date(Date.UTC(year, monthPart, 0)).toISOString().slice(0, 10);
    setMonthData(await api.getSelfServiceAttendance(token, { date_from: from, date_to: to }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await api.createSelfServiceAttendanceCorrection(token, form);
    setOpen(false);
    setForm({ attendance_date: "", requested_clock_in: "", requested_clock_out: "", reason: "" });
    await reload();
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((value) => !value)}><Plus className="h-4 w-4" />Correction request</Button>
      </div>
      {open ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
          <Input type="date" required value={form.attendance_date} onChange={(event) => setForm({ ...form, attendance_date: event.target.value })} />
          <Input type="time" value={form.requested_clock_in} onChange={(event) => setForm({ ...form, requested_clock_in: event.target.value })} />
          <Input type="time" value={form.requested_clock_out} onChange={(event) => setForm({ ...form, requested_clock_out: event.target.value })} />
          <Input required placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <Button type="submit">Submit</Button>
        </form>
      ) : null}
      <Panel className="overflow-hidden shadow-none">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Monthly attendance calendar</h2>
          <Input className="w-40" type="month" value={month} onChange={(event) => void loadMonth(event.target.value)} />
        </div>
        <MonthlyAttendanceCalendar month={month} records={rows(monthData, "records")} />
      </Panel>
      <SimpleTable title="Daily attendance" rows={rows(monthData, "records")} columns={["attendance_date", "status", "first_clock_in", "last_clock_out", "late_minutes", "missed_punch", "source"]} />
      <SimpleTable title="Correction requests" rows={rows(monthData, "corrections")} columns={["attendance_date", "requested_clock_in", "requested_clock_out", "status", "reason", "created_at"]} />
    </div>
  );
}

function LeaveSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const [leaveTypes, setLeaveTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ leave_type_id: "", start_date: "", end_date: "", half_day_type: "NONE", reason: "" });
  const enabled = Boolean(data?.leave_request_enabled);

  useEffect(() => {
    if (!token || !enabled) return;
    api.listLeaveTypes(token).then((result) => setLeaveTypes(result.leave_types.map((type) => ({ id: type.id, name: type.name })))).catch(() => setLeaveTypes([]));
  }, [token, enabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);
    try {
      const result = await api.createSelfServiceLeaveRequest(token, form);
      setMessage(result.document_required ? "Leave request was saved as draft because supporting document is required." : "Leave request submitted for approval.");
      setForm({ leave_type_id: "", start_date: "", end_date: "", half_day_type: "NONE", reason: "" });
      setOpen(false);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Leave request could not be created.");
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Self-service leave requests are locked to your linked employee profile.</div>
        {enabled ? <Button size="sm" onClick={() => setOpen((value) => !value)}><Plus className="h-4 w-4" />Create leave request</Button> : null}
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      {open ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_150px_150px_150px_1fr_auto]">
          <select className="h-9 rounded-md border bg-white px-3 text-sm" required value={form.leave_type_id} onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}>
            <option value="">Leave type</option>
            {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <Input type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          <Input type="date" required value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={form.half_day_type} onChange={(event) => setForm({ ...form, half_day_type: event.target.value })}>
            <option value="NONE">Full day</option>
            <option value="FIRST_HALF">First half</option>
            <option value="SECOND_HALF">Second half</option>
          </select>
          <Input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <Button type="submit">Submit</Button>
        </form>
      ) : null}
      <SimpleTable title="Leave balances" rows={rows(data, "balances")} columns={["period_year", "opening_balance", "earned_days", "used_days", "pending_days", "closing_balance"]} />
      <SimpleTable title="Leave requests" rows={rows(data, "requests")} columns={["leave_type_name", "start_date", "end_date", "total_days", "status", "document_status"]} />
      <SimpleTable title="Approval timeline" rows={rows(data, "approvals")} columns={["step_order", "step_name", "approver_type", "status", "note"]} />
    </div>
  );
}

function MonthlyAttendanceCalendar({ month, records }: { month: string; records: Row[] }) {
  const [year, monthPart] = month.split("-").map(Number);
  const days = Number.isFinite(year) && Number.isFinite(monthPart) ? new Date(year, monthPart, 0).getDate() : 0;
  const byDate = new Map(records.map((record) => [String(record.attendance_date), record]));
  return (
    <div className="overflow-x-auto p-3">
      <div className="grid min-w-[860px] grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="text-xs font-semibold uppercase text-muted-foreground">{day}</div>)}
        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const record = byDate.get(date);
          const firstDay = new Date(`${month}-01T00:00:00`).getDay();
          return (
            <div key={date} className="min-h-[104px] rounded-md border p-2 text-xs" style={index === 0 ? { gridColumnStart: firstDay + 1 } : undefined}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{day}</span>
                {record ? <StatusBadge value={record.status} /> : <Badge tone="neutral">No record</Badge>}
              </div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>In: {text(record?.first_clock_in)}</p>
                <p>Out: {text(record?.last_clock_out)}</p>
                {Number(record?.late_minutes ?? 0) > 0 ? <p className="text-amber-700">Late: {text(record?.late_minutes)}m</p> : null}
                {Number(record?.missed_punch ?? 0) === 1 ? <p className="text-red-700">Missed punch</p> : null}
                {record?.payroll_impact_json ? <p className="text-cyan-700">Payroll impact</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PayrollSection({ data }: { data: Record<string, unknown> | null }) {
  const profile = (data?.profile ?? {}) as Row;
  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-2 md:grid-cols-4">
        {["basic_salary", "currency", "payment_method", "payroll_included"].map((key) => (
          <div key={key} className="rounded-md border px-3 py-2">
            <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
            <p className="mt-1 text-sm font-medium">{text(profile[key])}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">Payslip download is prepared as a future foundation.</div>
      <SimpleTable title="Payroll run history" rows={rows(data, "runs")} columns={["period", "status", "basic_salary", "total_earnings", "total_deductions", "net_salary"]} />
      <SimpleTable title="Advances" rows={rows(data, "advances")} columns={["payment_date", "amount", "status", "notes"]} />
      <SimpleTable title="Deductions" rows={rows(data, "deductions")} columns={["deduction_type", "amount", "start_date", "end_date", "status", "reason"]} />
    </div>
  );
}

function AssetsSection({ data }: { data: Record<string, unknown> | null }) {
  return <div className="p-4"><SimpleTable title="My assets and uniforms" rows={rows(data, "assignments")} columns={["category_name", "asset_code", "asset_name", "issued_date", "expected_return_date", "returned_date", "status", "deduction_amount"]} /></div>;
}

function KycSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ section: "contact", field_key: "", requested_value: "", reason: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await api.createSelfServiceKycRequest(token, {
      section: form.section,
      field_key: form.field_key,
      requested_value: { value: form.requested_value },
      reason: form.reason
    });
    setForm({ section: "contact", field_key: "", requested_value: "", reason: "" });
    await reload();
  }

  return (
    <div className="space-y-4 p-4">
      <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border p-3 md:grid-cols-[140px_1fr_1fr_1fr_auto]">
        <select className="h-9 rounded-md border bg-white px-3 text-sm" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })}>
          <option value="contact">Contact</option>
          <option value="personal">Personal</option>
          <option value="emergency">Emergency</option>
          <option value="other">Other</option>
        </select>
        <Input placeholder="Field" value={form.field_key} onChange={(event) => setForm({ ...form, field_key: event.target.value })} />
        <Input required placeholder="Requested value" value={form.requested_value} onChange={(event) => setForm({ ...form, requested_value: event.target.value })} />
        <Input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        <Button type="submit"><FileText className="h-4 w-4" />Submit</Button>
      </form>
      <SimpleTable title="Submitted requests" rows={rows(data, "requests")} columns={["section", "field_key", "status", "reason", "created_at", "review_note"]} />
    </div>
  );
}

function SimpleTable({ title, rows, columns }: { title: string; rows: Row[]; columns: string[] }) {
  return (
    <Panel className="overflow-hidden shadow-none">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <DataTableFrame empty={!rows.length}>
        <Table>
          <TableHeader className="sticky top-0">
            <TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={String(row.id ?? index)}>
                {columns.map((column) => (
                  <TableCell key={column} className="whitespace-nowrap">
                    {column === "status" || column === "display_status" || column === "document_status" ? (
                      <StatusBadge value={row[column]} />
                    ) : column === "is_sensitive" && row[column] ? (
                      <Badge tone="warning">Sensitive</Badge>
                    ) : (
                      text(row[column])
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableFrame>
    </Panel>
  );
}
