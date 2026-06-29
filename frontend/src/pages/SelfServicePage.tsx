import { Bell, CalendarDays, CreditCard, Download, Eye, FileText, Landmark, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { MobileListCard, PageHeader, PageShell, QuickActionCard, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";

type Mode = "home" | "profile" | "documents" | "attendance" | "leave" | "roster" | "payroll" | "payment-methods" | "bank-loans" | "pension" | "contracts" | "onboarding" | "offboarding" | "assets" | "uniforms" | "approvals" | "notifications" | "kyc";
type Row = Record<string, unknown>;

const nav = [
  { mode: "home", label: "Dashboard", to: "/self-service" },
  { mode: "profile", label: "My Profile", to: "/self-service/profile" },
  { mode: "documents", label: "My Documents", to: "/self-service/documents" },
  { mode: "attendance", label: "My Attendance", to: "/self-service/attendance" },
  { mode: "leave", label: "My Leave", to: "/self-service/leave" },
  { mode: "roster", label: "My Roster", to: "/self-service/roster" },
  { mode: "payroll", label: "My Payroll", to: "/self-service/payroll" },
  { mode: "payment-methods", label: "Payment Methods", to: "/self-service/payment-methods" },
  { mode: "bank-loans", label: "Bank Loans", to: "/self-service/bank-loans" },
  { mode: "pension", label: "Pension", to: "/self-service/pension" },
  { mode: "contracts", label: "My Contracts", to: "/self-service/contracts" },
  { mode: "onboarding", label: "My Onboarding", to: "/self-service/onboarding" },
  { mode: "offboarding", label: "My Offboarding", to: "/self-service/offboarding" },
  { mode: "assets", label: "My Assets", to: "/self-service/assets" },
  { mode: "uniforms", label: "My Uniforms", to: "/self-service/uniforms" },
  { mode: "approvals", label: "Requests & Approvals", to: "/self-service/approvals" },
  { mode: "notifications", label: "Notifications", to: "/self-service/notifications" },
  { mode: "kyc", label: "KYC Requests", to: "/self-service/kyc-requests" }
] as const;

export function SelfServicePage({ mode = "home" }: { mode?: Mode }) {
  const { token } = useAuth();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeMode = mode;

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const self = await api.getSelfServiceMe(token);
      setLinked(self.linked_employee);
      if (!self.linked_employee || self.self_service_available === false) {
        setData(null);
        setMessage(self.unavailable_message ?? "Self-service is unavailable because your account is not linked to an active employee profile.");
        return;
      }
      if (activeMode === "home") setData(await api.getSelfServiceDashboard(token));
      if (activeMode === "profile") {
        const [profile, requests] = await Promise.all([
          api.getSelfServiceProfile(token),
          api.getSelfServiceProfileUpdateRequests(token).catch(() => ({ requests: [] }))
        ]);
        setData({ ...profile, profile_update_requests: requests.requests });
      }
      if (activeMode === "documents") {
        const [documents, compliance] = await Promise.all([
          api.getSelfServiceDocuments(token),
          api.getSelfServiceDocumentCompliance(token).catch(() => ({ compliance: null }))
        ]);
        setData({ ...documents, document_compliance: compliance.compliance });
      }
      if (activeMode === "attendance") {
        try {
          const [attendance, deviceSummary] = await Promise.all([
            api.getSelfServiceAttendance(token),
            api.getSelfServiceAttendanceDeviceSummary(token).catch(() => null)
          ]);
          setData({ ...attendance, device_summary: deviceSummary });
        } catch (err) {
          if (err instanceof ApiError && err.code === "ATTENDANCE_MODULE_DISABLED") {
            setData({ attendance_module_enabled: false });
          } else {
            throw err;
          }
        }
      }
      if (activeMode === "leave") setData(await api.getSelfServiceLeave(token));
      if (activeMode === "roster") {
        try {
          setData(await api.getSelfServiceRoster(token));
        } catch (err) {
          if (err instanceof ApiError && (err.code === "ROSTER_MODULE_DISABLED" || err.code === "ROSTER_SELF_SERVICE_DISABLED")) {
            setData({ roster_module_enabled: false });
          } else {
            throw err;
          }
        }
      }
      if (activeMode === "payroll") {
        const [payroll, paymentMethods, bankLoans, pension, customDeductions] = await Promise.all([
          api.getSelfServicePayroll(token),
          api.getSelfServicePaymentMethods(token).catch(() => ({ payment_methods: [] })),
          api.getSelfServiceBankLoans(token).catch(() => ({ loans: [], payments: [] })),
          api.getSelfServicePension(token).catch(() => ({ profile: null, contributions: [] })),
          api.getSelfServiceCustomDeductions(token).catch(() => ({ deductions: [], applications: [], message: null }))
        ]);
        setData({
          ...payroll,
          payment_methods: paymentMethods.payment_methods,
          bank_loans: bankLoans.loans,
          bank_loan_payments: bankLoans.payments,
          pension_profile: pension.profile,
          pension_contributions: pension.contributions,
          custom_deductions: customDeductions.deductions,
          custom_deduction_applications: customDeductions.applications,
          custom_deductions_message: customDeductions.message
        });
      }
      if (activeMode === "payment-methods") setData(await api.getSelfServicePaymentMethods(token));
      if (activeMode === "bank-loans") setData(await api.getSelfServiceBankLoans(token));
      if (activeMode === "pension") setData(await api.getSelfServicePension(token));
      if (activeMode === "contracts") setData(await api.getSelfServiceContracts(token));
      if (activeMode === "onboarding") setData(await api.getSelfServiceOnboarding(token));
      if (activeMode === "offboarding") setData(await api.getSelfServiceOffboarding(token));
      if (activeMode === "assets") setData(await api.getSelfServiceAssets(token));
      if (activeMode === "uniforms") setData(await api.getSelfServiceUniforms(token));
      if (activeMode === "approvals") setData(await api.getSelfServiceRequests(token));
      if (activeMode === "notifications") setData(await api.getSelfServiceNotifications(token));
      if (activeMode === "kyc") setData(await api.listSelfServiceKycRequests(token));
    } catch (err) {
      if (err instanceof ApiError && err.code === "SELF_SERVICE_UNAVAILABLE") {
        setError("Self-service is unavailable because your account is not linked to an active employee profile.");
      } else {
        setError(err instanceof Error ? err.message : "Self-service could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, activeMode]);

  return (
    <PageShell>
      <PageHeader
        title="Employee Self-Service"
        eyebrow="My HR workspace"
        description="View your own HR records, documents, attendance, leave, roster, payroll, approvals, and notifications."
        actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        }
      />

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
          {activeMode === "home" ? <SelfServiceDashboardSection data={data} /> : null}
          {activeMode === "profile" ? <ProfileSection data={data} token={token} reload={load} /> : null}
          {activeMode === "documents" ? <DocumentsSection data={data} /> : null}
          {activeMode === "attendance" ? <AttendanceSection data={data} token={token} reload={load} /> : null}
          {activeMode === "leave" ? <LeaveSection data={data} token={token} reload={load} /> : null}
          {activeMode === "roster" ? <RosterSelfServiceSection data={data} token={token} /> : null}
          {activeMode === "payroll" ? <PayrollSection data={data} token={token} /> : null}
          {activeMode === "payment-methods" ? <PaymentMethodsSection data={data} /> : null}
          {activeMode === "bank-loans" ? <BankLoansSection data={data} /> : null}
          {activeMode === "pension" ? <PensionSection data={data} /> : null}
          {activeMode === "contracts" ? <ContractsSelfServiceSection data={data} /> : null}
          {activeMode === "onboarding" ? <LifecycleSelfServiceSection data={data} kind="onboarding" /> : null}
          {activeMode === "offboarding" ? <LifecycleSelfServiceSection data={data} kind="offboarding" /> : null}
          {activeMode === "assets" ? <AssetsSection data={data} /> : null}
          {activeMode === "uniforms" ? <UniformsSection data={data} /> : null}
          {activeMode === "approvals" ? <SelfServiceRequestsSection data={data} /> : null}
          {activeMode === "notifications" ? <NotificationsSection data={data} token={token} reload={load} /> : null}
          {activeMode === "kyc" ? <KycSection data={data} token={token} reload={load} /> : null}
        </DataTableFrame>
      )}
    </PageShell>
  );
}

function rows(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function SelfServiceDashboardSection({ data }: { data: Record<string, unknown> | null }) {
  const employee = (data?.employee ?? {}) as Row;
  const summary = (data?.summary ?? {}) as Row;
  const notifications = rows(data, "notifications");
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Welcome, {text(employee.display_name ?? employee.full_name)}</h2>
            <p className="text-sm text-muted-foreground">Self-service shows your linked employee records only.</p>
          </div>
          <Badge tone="neutral">{text(employee.employee_no)}</Badge>
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-3">
        <QuickActionCard title="Request leave" description="Open your leave balance and requests." action={<Link to="/self-service/leave" className="text-xs font-medium text-primary hover:underline">Open leave</Link>} />
        <QuickActionCard title="Attendance correction" description="Review attendance and submit corrections." action={<Link to="/self-service/attendance" className="text-xs font-medium text-primary hover:underline">Open attendance</Link>} />
        <QuickActionCard title="My documents" description="Review document compliance and submissions." action={<Link to="/self-service/documents" className="text-xs font-medium text-primary hover:underline">Open documents</Link>} />
      </div>
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
        <SummaryBox label="Open leave requests" value={summary.open_leave_requests ?? 0} />
        <SummaryBox label="Attendance corrections" value={summary.pending_attendance_corrections ?? 0} />
        <SummaryBox label="Expiring documents" value={summary.expiring_documents ?? 0} badge />
        <SummaryBox label="Available payslips" value={summary.available_payslips ?? 0} />
        <SummaryBox label="Active assets" value={summary.active_assets ?? 0} />
        <SummaryBox label="Submitted approvals" value={summary.submitted_approvals ?? 0} />
        <SummaryBox label="Profile updates" value={summary.pending_profile_updates ?? 0} />
        <SummaryBox label="Unread notifications" value={data?.unread_notifications ?? 0} />
      </div>
      <div className="grid gap-3 md:hidden">
        {notifications.slice(0, 3).map((notification, index) => (
          <MobileListCard key={String(notification.id ?? index)} title={text(notification.title)} meta={text(notification.created_at)}>
            <StatusBadge value={notification.severity ?? notification.type} />
          </MobileListCard>
        ))}
      </div>
      <SimpleTable title="Upcoming roster" rows={Array.isArray(summary.upcoming_roster) ? summary.upcoming_roster as Row[] : []} columns={["roster_date", "status", "shift_code", "shift_name", "start_time", "end_time"]} />
      <SimpleTable title="Recent notifications" rows={notifications} columns={["type", "title", "severity", "created_at"]} />
    </div>
  );
}

function LifecycleSelfServiceSection({ data, kind }: { data: Record<string, unknown> | null; kind: "onboarding" | "offboarding" }) {
  const current = (data?.[kind] ?? null) as Row | null;
  const tasks = rows(data, "tasks");
  const events = rows(data, "events");
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">My {kind === "onboarding" ? "onboarding" : "offboarding"} checklist</h2>
            <p className="text-sm text-muted-foreground">This view is read-only and shows tasks assigned to your employee lifecycle case.</p>
          </div>
          {current ? <StatusBadge value={current.onboarding_status ?? current.offboarding_status} /> : null}
        </div>
        {current ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">Case</p><p className="mt-1 text-sm font-medium">{text(current.case_number)}</p></div>
            <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">Readiness</p><p className="mt-1 text-sm font-medium">{text(current.activation_status ?? current.finalization_status)}</p></div>
            <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">Due date</p><p className="mt-1 text-sm font-medium">{text(current.due_date)}</p></div>
          </div>
        ) : (
          <EmptyState title={`No ${kind} case`} description="There is no active lifecycle case for your employee profile." />
        )}
      </Panel>
      <Panel className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Group</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={String(task.id)}>
                <TableCell>{text(task.task_name ?? task.title ?? task.task_key)}</TableCell>
                <TableCell>{text(task.task_group)}</TableCell>
                <TableCell><StatusBadge value={task.task_status ?? task.status} /></TableCell>
                <TableCell>{text(task.due_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <Panel className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Recent lifecycle event</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.slice(0, 10).map((event) => (
              <TableRow key={String(event.id)}>
                <TableCell>{text(event.action)}</TableCell>
                <TableCell>{text(event.new_status)}</TableCell>
                <TableCell>{text(event.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function ContractsSelfServiceSection({ data }: { data: Record<string, unknown> | null }) {
  const active = (data?.active_contract ?? null) as Row | null;
  const salaryVisible = data?.salary_terms_visible === true;
  const history = rows(data, "contract_history");
  const fields: [string, unknown][] = active
    ? [
        ["Contract number", active.contract_number],
        ["Type", active.contract_type_display_name ?? active.contract_type_name_snapshot ?? "Not selected"],
        ["Status", active.status],
        ["Approval", active.approval_status],
        ["Start date", active.contract_start_date],
        ["End date", active.contract_end_date],
        ["Probation status", active.probation_status],
        ["Confirmation due", active.confirmation_due_date],
        ["Renewal status", active.renewal_status],
        ["Document", active.document_id ? "Linked" : "Not linked"]
      ]
    : [];
  if (active && salaryVisible) {
    fields.push(["Salary snapshot", active.basic_salary_snapshot], ["Currency", active.salary_currency_snapshot]);
  }
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">My active contract</h2>
            <p className="text-sm text-muted-foreground">Contract information is shown for your own employee profile only.</p>
          </div>
          {active ? <StatusBadge value={String(active.status ?? "ACTIVE")} /> : null}
        </div>
        {active ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-medium">{text(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No active contract" description={text(data?.message ?? "No active contract is currently available for your profile.")} />
        )}
      </Panel>
      <SimpleTable title="Contract history" rows={history} columns={["contract_number", "contract_type_display_name", "status", "approval_status", "contract_start_date", "contract_end_date", "renewal_status"]} />
    </div>
  );
}

function ProfileSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const employee = (data?.employee ?? {}) as Row;
  const contacts = rows(data, "contacts");
  const [form, setForm] = useState({ section: "personal", field_key: "display_name", requested_value: "", reason: "" });
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);
    try {
      await api.createSelfServiceProfileUpdateRequest(token, form);
      setForm({ section: "personal", field_key: "display_name", requested_value: "", reason: "" });
      setMessage("Profile update request submitted.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit profile update request.");
    }
  }
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
        <EmployeeIdentityCell employeeId={text(employee.id)} employeeName={text(employee.full_name)} employeeNumber={text(employee.employee_no)} departmentName={text(employee.department_name)} locationName={text(employee.location_name)} status={text(employee.status_name)} showStatus size="md" />
        <Link to="/self-service/kyc-requests"><Button size="sm"><Plus className="h-4 w-4" />Submit update request</Button></Link>
      </div>
      <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border p-3 md:grid-cols-[150px_180px_1fr_1fr_auto]">
        <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })}>
          <option value="personal">Personal</option>
          <option value="contact">Contact</option>
          <option value="emergency">Emergency</option>
          <option value="other">Other</option>
        </SelectField>
        <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.field_key} onChange={(event) => setForm({ ...form, field_key: event.target.value })}>
          <option value="display_name">Display name</option>
          <option value="nationality">Nationality</option>
          <option value="gender">Gender</option>
          <option value="date_of_birth">Date of birth</option>
          <option value="confirmation_date">Confirmation date</option>
        </SelectField>
        <Input required placeholder="Requested value" value={form.requested_value} onChange={(event) => setForm({ ...form, requested_value: event.target.value })} />
        <Input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        <Button type="submit"><FileText className="h-4 w-4" />Submit</Button>
      </form>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border px-3 py-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium">{text(value)}</p>
          </div>
        ))}
      </div>
      <SimpleTable title="Contact summary" rows={contacts} columns={["contact_type", "value", "relationship", "is_primary"]} />
      <SimpleTable title="Profile update requests" rows={rows(data, "profile_update_requests")} columns={["section", "field_key", "status", "reason", "created_at", "review_note"]} />
    </div>
  );
}

function DocumentsSection({ data }: { data: Record<string, unknown> | null }) {
  const compliance = (data?.document_compliance ?? null) as Row | null;
  const required = Array.isArray(compliance?.required_documents) ? compliance.required_documents as Row[] : [];
  const cases = Array.isArray(compliance?.renewal_cases) ? compliance.renewal_cases as Row[] : [];
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{text(compliance?.upload_note ?? data?.upload_note ?? "Document uploads are managed by HR/Admin.")}</div>
      {compliance ? (
        <div className="grid gap-2 md:grid-cols-4">
          <SummaryBox label="Compliance status" value={compliance.compliance_status} badge />
          <SummaryBox label="Compliance" value={`${text(compliance.compliance_percent)}%`} />
          <SummaryBox label="Missing required" value={(compliance.warning_summary as Row | undefined)?.missing_required ?? 0} />
          <SummaryBox label="Expiring soon" value={(compliance.warning_summary as Row | undefined)?.expiring_soon ?? 0} />
        </div>
      ) : null}
      <SimpleTable title="Required document checklist" rows={required} columns={["document_type_name", "status", "expiry_date", "days_until_expiry", "missing", "waived"]} />
      <SimpleTable title="Renewal cases" rows={cases} columns={["renewal_case_number", "document_type_name", "status", "priority", "due_date", "current_expiry_date"]} />
      <SimpleTable title="My documents" rows={rows(data, "documents")} columns={["document_type_name", "category_name", "issue_date", "expiry_date", "display_status", "is_sensitive"]} />
    </div>
  );
}

function SummaryBox({ label, value, badge = false }: { label: string; value: unknown; badge?: boolean }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{badge ? <Badge tone={String(value).includes("EXPIRED") || String(value).includes("MISSING") ? "danger" : String(value).includes("EXPIRING") ? "warning" : "success"}>{text(value)}</Badge> : text(value)}</p></div>;
}

function AttendanceSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [monthData, setMonthData] = useState<Record<string, unknown> | null>(data);
  const [form, setForm] = useState({ attendance_date: "", requested_clock_in: "", requested_clock_out: "", reason: "" });
  const attendanceEnabled = data?.attendance_module_enabled !== false;

  useEffect(() => {
    setMonthData(data);
  }, [data]);

  async function loadMonth(value: string) {
    setMonth(value);
    if (!token || !value || !attendanceEnabled) return;
    const [year, monthPart] = value.split("-").map(Number);
    const from = `${value}-01`;
    const to = new Date(Date.UTC(year, monthPart, 0)).toISOString().slice(0, 10);
    const [attendance, deviceSummary] = await Promise.all([
      api.getSelfServiceAttendance(token, { date_from: from, date_to: to }),
      api.getSelfServiceAttendanceDeviceSummary(token).catch(() => null)
    ]);
    setMonthData({ ...attendance, device_summary: deviceSummary });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await api.createSelfServiceAttendanceCorrection(token, form);
    setOpen(false);
    setForm({ attendance_date: "", requested_clock_in: "", requested_clock_out: "", reason: "" });
    await reload();
  }

  if (!attendanceEnabled) {
    return <div className="space-y-4 p-4"><Panel className="p-6 text-sm text-muted-foreground">Attendance module is disabled.</Panel></div>;
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
      <DeviceSelfServiceSummary data={monthData} />
      <SimpleTable title="Daily attendance" rows={rows(monthData, "records")} columns={["attendance_date", "status", "first_clock_in", "last_clock_out", "late_minutes", "missed_punch", "source"]} />
      <SimpleTable title="Correction requests" rows={rows(monthData, "corrections")} columns={["attendance_date", "requested_clock_in", "requested_clock_out", "status", "reason", "created_at"]} />
    </div>
  );
}

function DeviceSelfServiceSummary({ data }: { data: Record<string, unknown> | null }) {
  const summary = data?.device_summary as Record<string, unknown> | null | undefined;
  if (!summary) return null;
  return (
    <Panel className="overflow-hidden shadow-none">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Biometric attendance summary</h2>
        <p className="text-xs text-muted-foreground">Your active biometric mappings and latest imported punch logs.</p>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <SimpleTable title="My biometric mappings" rows={Array.isArray(summary.biometric_mappings) ? summary.biometric_mappings as Row[] : []} columns={["device_name", "biometric_user_id", "status"]} />
        <SimpleTable title="Recent device logs" rows={Array.isArray(summary.recent_raw_logs) ? summary.recent_raw_logs as Row[] : []} columns={["punch_time", "punch_type", "process_status", "source"]} />
      </div>
    </Panel>
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
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" required value={form.leave_type_id} onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}>
            <option value="">Leave type</option>
            {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </SelectField>
          <Input type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          <Input type="date" required value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.half_day_type} onChange={(event) => setForm({ ...form, half_day_type: event.target.value })}>
            <option value="NONE">Full day</option>
            <option value="FIRST_HALF">First half</option>
            <option value="SECOND_HALF">Second half</option>
          </SelectField>
          <Input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <Button type="submit">Submit</Button>
        </form>
      ) : null}
      <SimpleTable title="Leave balance cycles" rows={rows(data, "balance_cycles")} columns={["cycle_year", "leave_type_name", "opening_balance", "accrued_days", "used_days", "pending_days", "closing_balance"]} />
      <SimpleTable title="Leave ledger recent" rows={rows(data, "ledger_recent")} columns={["created_at", "leave_type_name", "entry_type", "days", "reason"]} />
      <SimpleTable title="Leave balances (compatibility)" rows={rows(data, "balances")} columns={["period_year", "opening_balance", "earned_days", "used_days", "pending_days", "closing_balance"]} />
      <SimpleTable title="Leave requests" rows={rows(data, "requests")} columns={["leave_type_name", "start_date", "end_date", "total_days", "status", "document_status"]} />
      <SimpleTable title="Approval timeline" rows={rows(data, "approvals")} columns={["step_order", "step_name", "approver_type", "status", "note"]} />
    </div>
  );
}

function RosterSelfServiceSection({ data, token }: { data: Record<string, unknown> | null; token: string | null }) {
  const [weekStart, setWeekStart] = useState(String(data?.week_start_date ?? new Date().toISOString().slice(0, 10)));
  const [weekData, setWeekData] = useState<Record<string, unknown> | null>(data);
  const enabled = data?.roster_module_enabled !== false;

  useEffect(() => {
    setWeekData(data);
    if (data?.week_start_date) setWeekStart(String(data.week_start_date));
  }, [data]);

  async function loadWeek(value: string) {
    setWeekStart(value);
    if (!token || !value || !enabled) return;
    try {
      setWeekData(await api.getSelfServiceRosterWeek(token, { week_start_date: value }));
    } catch {
      setWeekData({ assignments: [] });
    }
  }

  if (!enabled) {
    return <div className="space-y-4 p-4"><Panel className="p-6 text-sm text-muted-foreground">Roster self-service is disabled.</Panel></div>;
  }

  const assignments = rows(weekData, "assignments");
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Published roster only. Draft rosters are not visible here.</div>
        <Input className="w-44" type="date" value={weekStart} onChange={(event) => void loadWeek(event.target.value)} />
      </div>
      <Panel className="overflow-hidden shadow-none">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">My weekly roster</h2>
          <span className="text-xs text-muted-foreground">{text(weekData?.week_start_date)} to {text(weekData?.week_end_date)}</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={String(assignment.id ?? assignment.roster_date)}>
                  <TableCell>{text(assignment.roster_date)}</TableCell>
                  <TableCell><StatusBadge value={assignment.status} /></TableCell>
                  <TableCell>{text(assignment.shift_code ?? assignment.shift_name)}</TableCell>
                  <TableCell>{text(assignment.custom_start_time ?? assignment.shift_start_time)} - {text(assignment.custom_end_time ?? assignment.shift_end_time)}</TableCell>
                  <TableCell>{text(assignment.location_name)}</TableCell>
                  <TableCell>{Number(assignment.changed_after_publish ?? 0) === 1 || assignment.status === "CHANGED_AFTER_PUBLISH" ? <Badge tone="warning">Changed after publish</Badge> : text(assignment.notes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {assignments.length === 0 ? <EmptyState title="No published roster for this week" description="Published roster assignments will appear here." /> : null}
      </Panel>
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

function PayrollSection({ data, token }: { data: Record<string, unknown> | null; token: string | null }) {
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const profile = (data?.profile ?? {}) as Row;
  const payslips = rows(data, "payslips");
  const canDownload = Boolean(data?.payslip_download_enabled) || permissions.has("self_service.payslips.download") || permissions.has("self_service.payroll.view") || permissions.has("self_service.view");
  const [error, setError] = useState<string | null>(null);

  async function viewPayslip(row: Row) {
    if (!token) return;
    setError(null);
    try {
      const file = await api.previewSelfServicePayslip(token, String(row.id));
      window.open(URL.createObjectURL(file.blob), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to preview your payslip.");
    }
  }

  async function downloadPayslip(row: Row) {
    if (!token) return;
    setError(null);
    try {
      const file = await api.downloadSelfServicePayslip(token, String(row.id));
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename || `${String(row.payslip_number ?? "payslip")}.html`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download your payslip.");
    }
  }

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
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden shadow-none">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Payslips</h2>
          <span className="text-xs text-muted-foreground">Self-service payslips are limited to your linked employee profile.</span>
        </div>
        <DataTableFrame empty={!payslips.length}>
          <Table>
            <TableHeader className="sticky top-0">
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Payslip</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Net salary</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.map((row) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{text(row.period_month)}/{text(row.period_year)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.payslip_number)}</TableCell>
                  <TableCell><StatusBadge value={row.status} /></TableCell>
                  <TableCell>{text(row.version_number)}</TableCell>
                  <TableCell>{text(row.generated_at)}</TableCell>
                  <TableCell>{text(row.net_salary)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <RowActionButton intent="view" title="View payslip" onClick={() => void viewPayslip(row)}><Eye className="h-4 w-4" /></RowActionButton>
                      {canDownload ? <RowActionButton intent="download" title="Download payslip" onClick={() => void downloadPayslip(row)}><Download className="h-4 w-4" /></RowActionButton> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
      <SimpleTable title="Payroll run history" rows={rows(data, "runs")} columns={["period", "status", "basic_salary", "total_earnings", "total_deductions", "net_salary"]} />
      <SimpleTable title="My payment methods" rows={rows(data, "payment_methods")} columns={["payment_method_type", "payment_institution_name", "bank_account_number_masked", "allocation_type", "allocation_percentage", "allocation_amount", "status", "verification_status"]} />
      <SimpleTable title="My bank loans" rows={rows(data, "bank_loans")} columns={["payment_institution_name", "loan_reference_number", "monthly_installment_amount", "outstanding_balance", "eligibility_status", "status", "approval_status"]} />
      <SimpleTable title="Bank loan payment history" rows={rows(data, "bank_loan_payments")} columns={["bank_name_snapshot", "loan_reference_number_snapshot", "deducted_amount", "shortfall_amount", "payment_status", "bank_notification_status", "employee_direct_collection_message", "remittance_reference"]} />
      {data?.pension_profile ? <SimpleTable title="My pension profile" rows={[data.pension_profile as Row]} columns={["scheme_name", "enrollment_status", "pension_member_id", "effective_date", "status"]} /> : null}
      <SimpleTable title="My pension contributions" rows={rows(data, "pension_contributions")} columns={["scheme_name", "pensionable_wage", "employee_contribution_amount", "employer_contribution_amount", "total_contribution_amount", "contribution_status"]} />
      {data?.custom_deductions_message ? <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">{String(data.custom_deductions_message)}</div> : null}
      <SimpleTable title="My custom deductions" rows={rows(data, "custom_deductions")} columns={["template_name_snapshot", "category_snapshot", "assigned_amount", "total_amount", "remaining_balance", "approval_status", "status"]} />
      <SimpleTable title="Custom deduction payroll history" rows={rows(data, "custom_deduction_applications")} columns={["template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance_after", "application_status", "created_at"]} />
      <SimpleTable title="Advances" rows={rows(data, "advances")} columns={["payment_date", "amount", "status", "notes"]} />
      <SimpleTable title="Deductions" rows={rows(data, "deductions")} columns={["deduction_type", "amount", "start_date", "end_date", "status", "reason"]} />
    </div>
  );
}

function PaymentMethodsSection({ data }: { data: Record<string, unknown> | null }) {
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-3 text-sm text-muted-foreground">
        <CreditCard className="mr-2 inline h-4 w-4" /> Payment methods are read-only in employee self-service. Contact HR/Payroll for changes.
      </Panel>
      <SimpleTable title="My payment methods" rows={rows(data, "payment_methods")} columns={["payment_method_type", "payment_institution_name", "bank_account_number_masked", "allocation_type", "allocation_percentage", "allocation_amount", "status", "verification_status"]} />
    </div>
  );
}

function BankLoansSection({ data }: { data: Record<string, unknown> | null }) {
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-3 text-sm text-muted-foreground">
        <Landmark className="mr-2 inline h-4 w-4" /> Bank loan details are shown only when payroll settings allow employee self-service visibility.
      </Panel>
      <SimpleTable title="My bank loans" rows={rows(data, "loans")} columns={["payment_institution_name", "loan_reference_number", "monthly_installment_amount", "outstanding_balance", "eligibility_status", "status", "approval_status"]} />
      <SimpleTable title="Loan payment history" rows={rows(data, "payments")} columns={["bank_name_snapshot", "loan_reference_number_snapshot", "scheduled_installment_amount", "deducted_amount", "shortfall_amount", "payment_status", "bank_notification_status", "employee_direct_collection_message"]} />
    </div>
  );
}

function PensionSection({ data }: { data: Record<string, unknown> | null }) {
  const profile = data?.profile ? [data.profile as Row] : [];
  return (
    <div className="space-y-4 p-4">
      <Panel className="p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mr-2 inline h-4 w-4" /> Pension information is read-only and reflects payroll records prepared by the company.
      </Panel>
      <SimpleTable title="My pension profile" rows={profile} columns={["scheme_name", "scheme_code", "enrollment_status", "pension_member_id", "effective_date", "status"]} />
      <SimpleTable title="Contribution history" rows={rows(data, "contributions")} columns={["scheme_name", "payroll_period_id", "pensionable_wage", "employee_contribution_amount", "employer_contribution_amount", "total_contribution_amount", "contribution_status"]} />
    </div>
  );
}

function SelfServiceRequestsSection({ data }: { data: Record<string, unknown> | null }) {
  const requestData = (data?.requests ?? {}) as Row;
  return (
    <div className="space-y-4 p-4">
      <SimpleTable title="Profile update requests" rows={Array.isArray(requestData.profile_updates) ? requestData.profile_updates as Row[] : []} columns={["section", "field_key", "status", "reason", "created_at", "review_note"]} />
      <SimpleTable title="Leave requests" rows={Array.isArray(requestData.leave_requests) ? requestData.leave_requests as Row[] : []} columns={["request_type", "status", "created_at", "reason"]} />
      <SimpleTable title="Attendance correction requests" rows={Array.isArray(requestData.attendance_corrections) ? requestData.attendance_corrections as Row[] : []} columns={["attendance_date", "requested_status", "status", "reason", "created_at", "review_note"]} />
    </div>
  );
}

function NotificationsSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const notifications = rows(data, "notifications");
  const [message, setMessage] = useState<string | null>(null);
  async function markAllRead() {
    if (!token) return;
    setMessage(null);
    try {
      await api.markAllSelfServiceNotificationsRead(token);
      setMessage("Notifications marked as read.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update notifications.");
    }
  }
  async function markRead(row: Row) {
    if (!token) return;
    setMessage(null);
    try {
      await api.markSelfServiceNotificationRead(token, String(row.id));
      setMessage("Notification marked as read.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update notification.");
    }
  }
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground"><Bell className="mr-2 inline h-4 w-4" />Unread: {text(data?.unread_count ?? 0)}</div>
        <Button size="sm" variant="outline" onClick={() => void markAllRead()}>Mark all read</Button>
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <Panel className="overflow-hidden shadow-none">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">My notifications</h2></div>
        <DataTableFrame empty={!notifications.length}>
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {notifications.map((row) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{text(row.type)}</TableCell>
                  <TableCell>{text(row.title)}</TableCell>
                  <TableCell><StatusBadge value={row.severity} /></TableCell>
                  <TableCell>{text(row.created_at)}</TableCell>
                  <TableCell className="text-right"><RowActionButton intent="approve" size="sm" title="Mark read" onClick={() => void markRead(row)}>Mark read</RowActionButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
    </div>
  );
}

function AssetsSection({ data }: { data: Record<string, unknown> | null }) {
  return <div className="p-4"><SimpleTable title="My assets" rows={rows(data, "assignments")} columns={["category_name", "asset_code", "asset_name", "issued_date", "expected_return_date", "returned_date", "status", "assignment_status", "clearance_status", "deduction_amount"]} /></div>;
}

function UniformsSection({ data }: { data: Record<string, unknown> | null }) {
  return <div className="p-4"><SimpleTable title="My uniforms" rows={rows(data, "assignments")} columns={["uniform_type_name", "size_label", "quantity_issued", "quantity_returned", "quantity_damaged", "quantity_lost", "issued_date", "expected_return_date", "returned_date", "assignment_status", "clearance_status", "deduction_amount"]} /></div>;
}

function KycSection({ data, token, reload }: { data: Record<string, unknown> | null; token: string | null; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ section: "contact", field_key: "", requested_value: "", reason: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await api.createSelfServiceKycRequest(token, {
      section: form.section,
      field_key: form.field_key,
      requested_value: form.requested_value,
      reason: form.reason
    });
    setForm({ section: "contact", field_key: "", requested_value: "", reason: "" });
    await reload();
  }

  return (
    <div className="space-y-4 p-4">
      <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border p-3 md:grid-cols-[140px_1fr_1fr_1fr_auto]">
        <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })}>
          <option value="contact">Contact</option>
          <option value="personal">Personal</option>
          <option value="emergency">Emergency</option>
          <option value="other">Other</option>
        </SelectField>
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
