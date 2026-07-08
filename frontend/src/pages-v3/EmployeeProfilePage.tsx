import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageShell, SelectField, type StandardTabItem } from "../components/ui/page-shell";
import { NavRail } from "../components/ui/nav-rail";
import { Panel } from "../components/ui/panel";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { cn } from "../lib/utils";
import type { Employee, EmployeeContact, EmployeeContactInput, OnboardingStatus, OnboardingTask } from "../types/employees";
import type { EmployeeDocument } from "../types/documents";
import type { LeaveBalance, LeaveRequest } from "../types/leave";
import type { EmployeeUserAccount } from "../types/auth";
import { EmployeeContractsPanel } from "../components/employee/EmployeeContractsPanel";
import { EmployeePayrollPanel } from "../components/payroll/EmployeePayrollPanel";
import { EmployeeFinalSettlementPanel } from "../components/payroll/EmployeeFinalSettlementPanel";
import { EmployeeRosterPanel } from "../components/roster/EmployeeRosterPanel";
import { EmployeeAssetsPanel } from "../components/assets/EmployeeAssetsPanel";
import { EmployeeNotesPanel } from "../components/notes/EmployeeNotesPanel";
import { EmployeeAuditPanel } from "../components/audit/EmployeeAuditPanel";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FAECE7", text: "#993C1D" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function colorForName(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function statusPillTone(statusKey?: string | null) {
  if (statusKey === "ACTIVE" || statusKey === "ON_LEAVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (["DRAFT_ONBOARDING", "PENDING_SETUP", "PENDING_FINAL_VERIFICATION", "PENDING_APPROVAL", "ONBOARDING", "NOT_ACTIVE"].includes(statusKey ?? "")) return { bg: "#FAEEDA", text: "#854F0B" };
  if (statusKey === "ARCHIVED") return { bg: "#F7F7FB", text: "#6B6F86" };
  return { bg: "#FCEBEB", text: "#A32D2D" };
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateShort(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMERGENCY_CONTACT_TYPES = new Set(["EMERGENCY", "GUARDIAN", "SPOUSE", "PARENT"]);

interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
}

type PopupKind = "documents" | "leave" | "emergency" | "onboarding" | null;

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingTask[]>([]);
  const [contacts, setContacts] = useState<EmployeeContact[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [userAccount, setUserAccount] = useState<EmployeeUserAccount | null>(null);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupKind>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [contactModal, setContactModal] = useState<{ mode: "create" | "edit"; contact?: EmployeeContact } | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const assetsUniformsVisible = user?.module_visibility?.assets_uniforms !== false;
  const canContracts = permissions.has("employees.contracts.view") || permissions.has("contracts.view");
  const canPayroll = permissions.has("employees.payroll.view") || permissions.has("payroll.view");
  const canFinalSettlement = permissions.has("employees.final_settlement.view") || permissions.has("final_settlement.view") || permissions.has("final_settlement.cases.view");
  const canRoster = permissions.has("employees.roster.view") || permissions.has("roster.view");
  const canAssets = assetsUniformsVisible && (permissions.has("employees.assets.view") || permissions.has("assets.view"));
  const canNotes = permissions.has("employee_notes.view");
  const canAudit = permissions.has("employees.audit.view") || permissions.has("audit.view");

  const tabItems: StandardTabItem[] = [
    { key: "overview", label: "Overview" },
    { key: "contracts", label: "Contracts" },
    { key: "payroll", label: "Payroll" },
    { key: "final-settlement", label: "Final settlement" },
    { key: "roster", label: "Roster" },
    { key: "assets", label: "Assets & uniforms", hidden: !assetsUniformsVisible },
    { key: "notes", label: "Notes" },
    { key: "audit", label: "Audit log" }
  ];

  async function load() {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [overview, docs, attendanceSummary, leaveSummary, account] = await Promise.all([
        api.getEmployeeOverview(token, id),
        api.listEmployeeDocuments(token, id).catch(() => ({ documents: [], missing: [] })),
        api.getEmployeeAttendanceSummary(token, id).catch(() => ({ summary: {}, records: [], corrections: [] })),
        api.getEmployeeLeaveSummary(token, id).catch(() => ({ requests: [], balances: [], calendar: [] })),
        api.getEmployeeUserAccount(token, id).catch(() => ({ user_account: null }))
      ]);
      setEmployee(overview.employee);
      setOnboarding(overview.onboarding);
      setContacts(overview.contacts);
      setAudit(overview.audit ?? []);
      setDocuments(docs.documents);
      const s = attendanceSummary.summary as Record<string, number>;
      setAttendance({ present: s.present ?? 0, absent: s.absent ?? 0, late: s.late ?? 0 });
      setLeaveBalances(leaveSummary.balances ?? []);
      setLeaveRequests((leaveSummary.requests ?? []).slice(0, 3));
      setUserAccount(account.user_account ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee 360.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, id]);

  const emergencyContacts = useMemo(
    () => contacts.filter((c) => EMERGENCY_CONTACT_TYPES.has(c.contact_type) || c.emergency_priority !== null).sort((a, b) => (a.emergency_priority ?? 99) - (b.emergency_priority ?? 99)),
    [contacts]
  );
  const officeEmail = contacts.find((c) => c.contact_type === "WORK_EMAIL")?.value ?? contacts.find((c) => c.contact_type === "PERSONAL_EMAIL")?.value ?? null;
  const officePhone = contacts.find((c) => c.contact_type === "WORK_PHONE")?.value ?? contacts.find((c) => c.contact_type === "PERSONAL_PHONE")?.value ?? null;
  const onboardingComplete = onboarding.filter((t) => t.status === "COMPLETED").length;
  const onboardingPercent = onboarding.length ? Math.round((onboardingComplete / onboarding.length) * 100) : 0;
  const attendanceTotal = attendance ? attendance.present + attendance.absent : 0;
  const attendanceRate = attendance && attendanceTotal > 0 ? Math.round((attendance.present / attendanceTotal) * 100) : null;

  async function saveContact(input: EmployeeContactInput) {
    if (!token || !id || !contactModal) return;
    if (contactModal.mode === "create") await api.createEmployeeContact(token, id, input);
    else if (contactModal.contact) await api.updateEmployeeContact(token, id, contactModal.contact.id, input);
    setContactModal(null);
    await load();
  }

  async function removeContact(contact: EmployeeContact) {
    if (!token || !id) return;
    await api.archiveEmployeeContact(token, id, contact.id, "Removed from Employee 360");
    await load();
  }

  async function toggleOnboardingTask(task: OnboardingTask) {
    if (!token || !id) return;
    const nextStatus: OnboardingStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    await api.updateEmployeeOnboardingTask(token, id, task.id, nextStatus);
    await load();
  }

  if (loading) {
    return (
      <PageShell>
        <Panel className="h-40 animate-pulse" />
      </PageShell>
    );
  }

  if (error || !employee) {
    return (
      <PageShell>
        <Panel><EmptyState title="Employee not found" description={error ?? "This employee record is unavailable."} /></Panel>
      </PageShell>
    );
  }

  const color = colorForName(employee.full_name);
  const pillTone = statusPillTone(employee.status_key);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-0 overflow-hidden rounded-card border shadow-panel">
        <div className="flex items-center justify-between px-6 pb-11 pt-5" style={{ background: "#EEEDFE" }}>
          <Link to="/employees" className="inline-flex items-center gap-1.5 text-xs text-[#6B6F86] hover:text-slate-900">
            &larr; Employees / {employee.full_name}
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditOpen(true)} className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm hover:bg-slate-50">
              Edit profile
            </button>
          </div>
        </div>

        <div className="bg-white px-6 pb-5">
          <div className="-mt-9 mb-3.5 flex items-end gap-3.5">
            <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full border-4 border-white text-xl font-medium" style={{ background: color.bg, color: color.text }}>
              {initialsOf(employee.full_name)}
            </div>
            <div className="pb-1.5">
              <div className="flex items-center gap-2">
                <p className="text-base font-medium text-slate-950">{employee.full_name}</p>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium" style={{ background: pillTone.bg, color: pillTone.text }}>
                  {employee.status_name ?? humanizeTechnicalLabel(employee.status_key)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {employee.employee_no}
                {employee.position_title ? ` · ${employee.position_title}` : ""}
                {employee.department_name ? `, ${employee.department_name}` : ""}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {employee.joining_date ? <FactPill>Joined {formatDate(employee.joining_date)}</FactPill> : null}
            {employee.reporting_manager_name ? <FactPill>Reports to {employee.reporting_manager_name}</FactPill> : null}
            {employee.location_name ? <FactPill>{employee.location_name}</FactPill> : null}
            <FactPill>{humanizeTechnicalLabel(employee.employment_type)}</FactPill>
          </div>

          <div className="flex gap-4">
            <NavRail items={tabItems} active={activeTab} onChange={setActiveTab} className="hidden w-[172px] shrink-0 sm:flex" />
            <div className="min-w-0 flex-1">
          {activeTab === "overview" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Tile span="xl:col-span-3" title="Personal & contact">
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 text-xs">
                <Fact label="Date of birth" value={formatDate(employee.date_of_birth)} />
                <Fact label="Nationality" value={employee.nationality ?? "Not set"} />
                <Fact label="Office email" value={officeEmail ?? "Not set"} />
                <Fact label="Phone" value={officePhone ?? "Not set"} />
              </div>
            </Tile>

            <Tile span="xl:col-span-3" title="Documents" onClick={() => setPopup("documents")} action={<span className="text-[11px] text-primary">{documents.length} total</span>}>
              {documents.length ? (
                <div className="flex flex-col gap-2">
                  {documents.slice(0, 2).map((doc) => <DocumentRow key={doc.id} doc={doc} compact />)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
              )}
            </Tile>

            <Tile span="xl:col-span-3" title="Emergency contacts" onClick={() => setPopup("emergency")} action={<span className="text-[11px] text-primary">{emergencyContacts.length} total</span>}>
              {emergencyContacts.length ? (
                <div className="flex flex-col gap-2">
                  {emergencyContacts.slice(0, 2).map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="shrink-0 rounded-md bg-[#F7F7FB] px-2 py-0.5 text-[9px] font-medium text-muted-foreground">P{c.emergency_priority ?? "-"}</span>
                      <p className="truncate text-xs text-slate-950">{c.notes || humanizeTechnicalLabel(c.relationship ?? c.contact_type)} · {c.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No emergency contacts added yet.</p>
              )}
            </Tile>

            <Tile span="xl:col-span-2" title="Attendance" onClick={() => navigate(`/attendance/records?employee_id=${employee.id}`)}>
              {attendanceRate !== null ? (
                <>
                  <p className="text-2xl font-medium text-slate-950">{attendanceRate}%</p>
                  <p className="mt-1 text-xs text-[#27500A]">{attendance!.present}/{attendanceTotal} days present on record</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No attendance records yet.</p>
              )}
            </Tile>

            <Tile span="xl:col-span-2" title="Leave" onClick={() => setPopup("leave")}>
              {leaveBalances.length ? (
                <div className="flex gap-4">
                  {leaveBalances.slice(0, 2).map((b) => (
                    <div key={b.id}>
                      <p className="text-base font-medium text-slate-950">{b.used_days}/{Math.round(b.closing_balance + b.used_days)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{b.leave_type_name ?? "Leave"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No leave balances set up yet.</p>
              )}
            </Tile>

            <Tile span="xl:col-span-2" title="" onClick={() => setPopup("onboarding")} centered>
              <RingChart percent={onboardingPercent} />
              <p className="mt-2 text-xs text-muted-foreground">Onboarding {onboardingPercent}% complete</p>
            </Tile>

            <Tile span="xl:col-span-3" title="Job & compensation">
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 text-xs">
                <Fact label="Position" value={employee.position_title ?? "Not set"} />
                <Fact label="Job level" value={employee.job_level_name ?? "Not set"} />
              </div>
            </Tile>

            <Tile span="xl:col-span-3" title="User access">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: userAccount?.linked_user ? "#5DCAA5" : "#F09595" }} />
                <p className="text-xs text-slate-950">{userAccount?.linked_user ? `Linked to ${userAccount.linked_user.email}` : "No login yet"}</p>
              </div>
              <Link to={`/employees/${employee.id}?setup=1`} className="text-xs text-primary hover:underline">
                {userAccount?.linked_user ? "Manage access" : "Provision account"}
              </Link>
            </Tile>
          </div>
          ) : null}

          {activeTab === "contracts" ? (
            canContracts ? <EmployeeContractsPanel employee={employee} token={token!} permissions={permissions} /> : <Panel className="p-4"><EmptyState title="Contracts unavailable" description="Your account needs employee contract access." /></Panel>
          ) : null}
          {activeTab === "payroll" ? (
            canPayroll ? <EmployeePayrollPanel employee={employee} /> : <Panel className="p-4"><EmptyState title="Payroll unavailable" description="Your account needs employee payroll access." /></Panel>
          ) : null}
          {activeTab === "final-settlement" ? (
            canFinalSettlement ? <EmployeeFinalSettlementPanel employee={employee} /> : <Panel className="p-4"><EmptyState title="Final settlement unavailable" description="Your account needs employee final settlement access." /></Panel>
          ) : null}
          {activeTab === "roster" ? (
            canRoster ? <EmployeeRosterPanel token={token!} employee={employee} permissions={permissions} /> : <Panel className="p-4"><EmptyState title="Roster unavailable" description="Your account needs employees.roster.view permission." /></Panel>
          ) : null}
          {activeTab === "assets" ? (
            canAssets ? <EmployeeAssetsPanel employee={employee} /> : <Panel className="p-4"><EmptyState title="Assets unavailable" description="Your account needs employee asset access." /></Panel>
          ) : null}
          {activeTab === "notes" ? (
            canNotes ? <EmployeeNotesPanel employee={employee} /> : <Panel className="p-4"><EmptyState title="Notes unavailable" description="Your account needs employee_notes.view permission." /></Panel>
          ) : null}
          {activeTab === "audit" ? (
            canAudit ? <EmployeeAuditPanel employee={employee} initialAudit={audit} /> : <Panel className="p-4"><EmptyState title="Audit unavailable" description="Your account needs employee audit access." /></Panel>
          ) : null}
            </div>
          </div>
        </div>
      </div>

      <DocumentsPopup open={popup === "documents"} onClose={() => setPopup(null)} employeeName={employee.full_name} documents={documents} />
      <LeavePopup open={popup === "leave"} onClose={() => setPopup(null)} employeeName={employee.full_name} balances={leaveBalances} requests={leaveRequests} onRequestLeave={() => navigate("/v3-preview/leave/requests")} />
      <EmergencyContactsPopup
        open={popup === "emergency"}
        onClose={() => setPopup(null)}
        employeeName={employee.full_name}
        contacts={emergencyContacts}
        onAdd={() => setContactModal({ mode: "create" })}
        onEdit={(c) => setContactModal({ mode: "edit", contact: c })}
        onRemove={(c) => void removeContact(c)}
      />
      <OnboardingPopup open={popup === "onboarding"} onClose={() => setPopup(null)} employeeName={employee.full_name} tasks={onboarding} onToggle={(t) => void toggleOnboardingTask(t)} />

      {editOpen ? <EditProfileModal employee={employee} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void load(); }} /> : null}
      {contactModal ? <ContactModal mode={contactModal.mode} contact={contactModal.contact} onClose={() => setContactModal(null)} onSave={saveContact} /> : null}
    </PageShell>
  );
}

function FactPill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] text-[#6B6F86] shadow-sm">{children}</span>;
}

function Tile({ title, children, span, onClick, action, centered }: { title: string; children: React.ReactNode; span: string; onClick?: () => void; action?: React.ReactNode; centered?: boolean }) {
  return (
    <Panel
      className={cn("p-4", span, onClick && "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md", centered && "flex flex-col items-center justify-center text-center")}
      onClick={onClick}
    >
      {title ? (
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {action}
        </div>
      ) : null}
      {children}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-slate-950">{value}</p>
    </div>
  );
}

function RingChart({ percent, color = "#5B4FE9" }: { percent: number; color?: string }) {
  const circumference = 2 * Math.PI * 34;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width="70" height="70" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r="34" fill="none" stroke="#E7E7F1" strokeWidth="7" />
      <circle cx="42" cy="42" r="34" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" fontSize="14" fontWeight="500" fill="#14162B">{percent}%</text>
    </svg>
  );
}

const DOC_ICON_COLORS: Record<string, { bg: string; text: string }> = {
  pdf: { bg: "#FCEBEB", text: "#A32D2D" },
  doc: { bg: "#E6F1FB", text: "#0C447C" },
  docx: { bg: "#E6F1FB", text: "#0C447C" }
};

function docStatusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("expir")) return { bg: "#FCEBEB", text: "#A32D2D" };
  if (s.includes("missing") || s.includes("pending")) return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#EAF3DE", text: "#27500A" };
}

function DocumentRow({ doc, compact }: { doc: EmployeeDocument; compact?: boolean }) {
  const ext = (doc.original_filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const color = DOC_ICON_COLORS[ext] ?? { bg: "#F7F7FB", text: "#6B6F86" };
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg", compact ? "" : "bg-[#F7F7FB] p-2.5")}>
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: color.bg, color: color.text }}>
        <FileText className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-950">{doc.original_filename ?? doc.document_type_name ?? "Document"}</p>
        {!compact ? <p className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size_bytes)}{doc.uploaded_at ? ` · Uploaded ${formatDateShort(doc.uploaded_at)}` : ""}</p> : null}
      </div>
      {!compact ? (
        <>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: docStatusTone(doc.display_status).bg, color: docStatusTone(doc.display_status).text }}>
            {humanizeTechnicalLabel(doc.display_status)}
          </span>
          <div className="flex shrink-0 gap-2 text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            <MoreHorizontal className="h-3.5 w-3.5" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DocumentsPopup({ open, onClose, employeeName, documents }: { open: boolean; onClose: () => void; employeeName: string; documents: EmployeeDocument[] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Documents</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{employeeName} · {documents.length} files</p>
        </DialogHeader>
        <DialogBody className="p-0">
          <div className="flex justify-end px-5 pt-4">
            <Link to="/documents" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              <Upload className="h-3.5 w-3.5" /> Upload document
            </Link>
          </div>
          <div className="flex flex-col gap-2 p-5 pt-3">
            {documents.length ? documents.map((doc) => <DocumentRow key={doc.id} doc={doc} />) : <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const LEAVE_RING_COLORS = ["#378ADD", "#F0997B", "#5DCAA5", "#AFA9EC"];

function leaveStatusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "APPROVED") return { bg: "#EAF3DE", text: "#27500A" };
  if (s.includes("PENDING") || s.includes("SUBMITTED")) return { bg: "#FAEEDA", text: "#854F0B" };
  if (s.includes("REJECT") || s.includes("CANCEL")) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

function LeavePopup({ open, onClose, employeeName, balances, requests, onRequestLeave }: { open: boolean; onClose: () => void; employeeName: string; balances: LeaveBalance[]; requests: LeaveRequest[]; onRequestLeave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Leave</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{employeeName} · {new Date().getFullYear()} cycle</p>
        </DialogHeader>
        <DialogBody>
          {balances.length ? (
            <div className="mb-5 flex justify-around border-b pb-5">
              {balances.slice(0, 2).map((b, i) => {
                const total = Math.max(1, Math.round(b.closing_balance + b.used_days));
                return (
                  <div key={b.id} className="flex flex-col items-center gap-2">
                    <RingChart percent={Math.round((b.used_days / total) * 100)} color={LEAVE_RING_COLORS[i % LEAVE_RING_COLORS.length]} />
                    <span className="text-xs text-muted-foreground">{b.leave_type_name ?? "Leave"}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-950">Recent requests</p>
            <button type="button" onClick={onRequestLeave} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground">
              <Plus className="h-3 w-3" /> Request leave
            </button>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {requests.length ? requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-[#F7F7FB] p-2.5">
                <div>
                  <p className="text-xs font-medium text-slate-950">{r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDateShort(r.start_date)} – ${formatDate(r.end_date)}`}</p>
                  <p className="text-[10px] text-muted-foreground">{r.leave_type_name ?? "Leave"} · {r.total_days} day{r.total_days === 1 ? "" : "s"}</p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: leaveStatusTone(r.status).bg, color: leaveStatusTone(r.status).text }}>
                  {humanizeTechnicalLabel(r.status)}
                </span>
              </div>
            )) : <p className="text-xs text-muted-foreground">No recent leave requests.</p>}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function EmergencyContactsPopup({ open, onClose, employeeName, contacts, onAdd, onEdit, onRemove }: { open: boolean; onClose: () => void; employeeName: string; contacts: EmployeeContact[]; onAdd: () => void; onEdit: (c: EmployeeContact) => void; onRemove: (c: EmployeeContact) => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Emergency contacts</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{employeeName} · {contacts.length} contact{contacts.length === 1 ? "" : "s"}</p>
        </DialogHeader>
        <DialogBody className="p-0">
          <div className="flex justify-end px-5 pt-4">
            <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Add contact
            </button>
          </div>
          <div className="flex flex-col gap-2 p-5 pt-3">
            {contacts.length ? contacts.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-lg bg-[#F7F7FB] p-2.5">
                <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[9px] font-medium text-muted-foreground">P{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-950">{c.notes || humanizeTechnicalLabel(c.relationship ?? c.contact_type)}</p>
                  <p className="text-[10px] text-muted-foreground">{humanizeTechnicalLabel(c.relationship ?? c.contact_type)} · {c.value}</p>
                </div>
                <div className="flex shrink-0 gap-2 text-muted-foreground">
                  <button type="button" onClick={() => onEdit(c)}><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => onRemove(c)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground">No emergency contacts added yet.</p>}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const ONBOARDING_ICONS: Record<OnboardingStatus, { icon: LucideIcon; color: string }> = {
  COMPLETED: { icon: CheckCircle2, color: "#27500A" },
  PENDING: { icon: Circle, color: "#9A9DB0" },
  BLOCKED: { icon: AlertCircle, color: "#A32D2D" },
  SKIPPED: { icon: CheckCircle2, color: "#6B6F86" }
};

function OnboardingPopup({ open, onClose, employeeName, tasks, onToggle }: { open: boolean; onClose: () => void; employeeName: string; tasks: OnboardingTask[]; onToggle: (task: OnboardingTask) => void }) {
  const complete = tasks.filter((t) => t.status === "COMPLETED").length;
  const percent = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Onboarding checklist</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{employeeName} · {complete}/{tasks.length} tasks complete</p>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#E7E7F1]">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-col gap-2">
            {tasks.length ? tasks.map((task) => {
              const { icon: Icon, color } = ONBOARDING_ICONS[task.status];
              return (
                <button type="button" key={task.id} onClick={() => onToggle(task)} className="flex items-center gap-2.5 rounded-lg bg-[#F7F7FB] p-2.5 text-left">
                  <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                  <p className="flex-1 text-xs text-slate-950">{task.title}</p>
                  {task.status === "COMPLETED" && task.completed_at ? (
                    <span className="text-[9px] text-muted-foreground">{formatDateShort(task.completed_at)}</span>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: task.status === "BLOCKED" ? "#FCEBEB" : "#FAEEDA", color: task.status === "BLOCKED" ? "#A32D2D" : "#854F0B" }}>
                      {humanizeTechnicalLabel(task.status)}
                    </span>
                  )}
                </button>
              );
            }) : <p className="text-xs text-muted-foreground">No onboarding tasks tracked for this employee.</p>}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function EditProfileModal({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [fullName, setFullName] = useState(employee.full_name);
  const [displayName, setDisplayName] = useState(employee.display_name ?? "");
  const [gender, setGender] = useState(employee.gender ?? "");
  const [dob, setDob] = useState(employee.date_of_birth ?? "");
  const [nationality, setNationality] = useState(employee.nationality ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateEmployee(token, employee.id, {
        employee_no: employee.employee_no,
        full_name: fullName,
        display_name: displayName,
        gender,
        date_of_birth: dob,
        nationality,
        employee_type: employee.employee_type,
        employment_type: employee.employment_type,
        status_id: employee.status_id,
        primary_department_id: employee.primary_department_id ?? "",
        primary_position_id: employee.primary_position_id ?? "",
        primary_location_id: employee.primary_location_id ?? "",
        job_level_id: employee.job_level_id ?? "",
        joining_date: employee.joining_date ?? "",
        confirmation_date: employee.confirmation_date ?? "",
        contract_start_date: employee.contract_start_date ?? "",
        contract_end_date: employee.contract_end_date ?? "",
        probation_end_date: employee.probation_end_date ?? "",
        reporting_manager_employee_id: employee.reporting_manager_employee_id ?? "",
        payroll_included: employee.payroll_included,
        roster_eligible: employee.roster_eligible,
        notes_summary: employee.notes_summary ?? ""
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Gender</Label><Input value={gender} onChange={(e) => setGender(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date of birth</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Nationality</Label><Input value={nationality} onChange={(e) => setNationality(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CONTACT_TYPE_OPTIONS: EmployeeContact["contact_type"][] = ["EMERGENCY", "GUARDIAN", "SPOUSE", "PARENT", "OTHER"];

function ContactModal({ mode, contact, onClose, onSave }: { mode: "create" | "edit"; contact?: EmployeeContact; onClose: () => void; onSave: (input: EmployeeContactInput) => Promise<void> }) {
  const [contactType, setContactType] = useState(contact?.contact_type ?? "EMERGENCY");
  const [value, setValue] = useState(contact?.value ?? "");
  const [relationship, setRelationship] = useState(contact?.relationship ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [priority, setPriority] = useState(contact?.emergency_priority ?? 1);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        contact_type: contactType,
        value,
        relationship: relationship || null,
        is_primary: priority === 1,
        emergency_priority: priority,
        is_sensitive: false,
        notes: notes || null
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{mode === "create" ? "Add emergency contact" : "Edit emergency contact"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Name</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contact's name" /></div>
            <div className="space-y-1.5">
              <Label>Relationship type</Label>
              <SelectField value={contactType} onValueChange={(v) => setContactType(v as EmployeeContact["contact_type"])}>
                {CONTACT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Relationship (e.g. Mother)</Label><Input value={relationship} onChange={(e) => setRelationship(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Phone number</Label><Input value={value} onChange={(e) => setValue(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" min={1} max={9} value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!value.trim()} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
