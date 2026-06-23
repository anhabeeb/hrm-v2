import { Archive, ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChangeEmployeeStatusModal } from "../components/employee/ChangeEmployeeStatusModal";
import { EmployeeAttendancePanel } from "../components/attendance/EmployeeAttendancePanel";
import { EmployeeAuditPanel } from "../components/audit/EmployeeAuditPanel";
import { EmployeeAssetsPanel } from "../components/assets/EmployeeAssetsPanel";
import { EmployeeAvatar } from "../components/employee/EmployeeAvatar";
import { EmployeeDocumentsPanel } from "../components/employee/EmployeeDocumentsPanel";
import { EmployeeProfilePhotoControls } from "../components/employee/EmployeeProfilePhotoControls";
import { EmployeeLeavePanel } from "../components/leave/EmployeeLeavePanel";
import { EmployeeNotesPanel } from "../components/notes/EmployeeNotesPanel";
import { EmployeePayrollPanel } from "../components/payroll/EmployeePayrollPanel";
import { EmployeeRosterPanel } from "../components/roster/EmployeeRosterPanel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { EmployeeUserAccessPreview } from "../types/auth";
import type { Employee, EmployeeContact, EmployeeContactInput, EmployeeStatusSetting, OnboardingStatus, OnboardingTask } from "../types/employees";

const profileTabs = ["Overview", "Personal Info", "Job Info", "Contacts", "User Access", "Payroll", "Attendance", "Roster", "Leave", "Documents", "Assets & Uniforms", "Notes", "Audit Log"] as const;
type ProfileTab = (typeof profileTabs)[number];

function tone(status?: string) {
  if (status === "ACTIVE" || status === "ON_LEAVE") return "success";
  if (status === "DRAFT_ONBOARDING") return "warning";
  if (status === "ARCHIVED") return "neutral";
  return "danger";
}

export function EmployeeProfilePage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ProfileTab>("Overview");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [statuses, setStatuses] = useState<EmployeeStatusSetting[]>([]);
  const [contacts, setContacts] = useState<EmployeeContact[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingTask[]>([]);
  const [jobHistory, setJobHistory] = useState<Record<string, unknown>[]>([]);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [profileRequests, setProfileRequests] = useState<Record<string, unknown>[]>([]);
  const [userAccess, setUserAccess] = useState<EmployeeUserAccessPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactModal, setContactModal] = useState<{ mode: "create" | "edit"; contact?: EmployeeContact } | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [contactArchiveTarget, setContactArchiveTarget] = useState<EmployeeContact | null>(null);
  const [contactArchiveReason, setContactArchiveReason] = useState("");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.view");
  const canArchive = permissions.has("employees.archive");
  const canStatus = permissions.has("employees.status.manage");
  const canContacts = permissions.has("employees.contacts.manage");
  const canOnboarding = permissions.has("employees.onboarding.manage");
  const canLeave = permissions.has("employees.leave.view") || permissions.has("leave.view");
  const canAttendance = permissions.has("employees.attendance.view") || permissions.has("attendance.view");
  const canRoster = permissions.has("employees.roster.view") || permissions.has("roster.view");
  const canPayroll = permissions.has("employees.payroll.view") || permissions.has("payroll.view");
  const canAssets = permissions.has("employees.assets.view") || permissions.has("assets.view");
  const canNotes = permissions.has("employee_notes.view");
  const canAudit = permissions.has("employees.audit.view") || permissions.has("audit.view");
  const canViewUserAccess = permissions.has("role_mappings.view");
  const canApplyUserAccess = permissions.has("role_mappings.apply");
  const canUploadPhoto = permissions.has("documents.upload");
  const canClearPhoto = permissions.has("documents.archive");

  async function load() {
    if (!token || !id || !canView) return;
    setError(null);
    try {
      const [overview, statusesResult] = await Promise.all([api.getEmployeeOverview(token, id), api.listEmployeeStatuses(token)]);
      setEmployee(overview.employee);
      setStatuses(statusesResult.statuses);
      setContacts(overview.contacts);
      setOnboarding(overview.onboarding);
      setAudit(overview.audit);
      try {
        setJobHistory((await api.listEmployeeJobHistory(token, id)).job_history);
      } catch {
        setJobHistory([]);
      }
      if (canViewUserAccess) {
        try {
          setUserAccess((await api.getEmployeeUserAccess(token, id)).preview);
        } catch {
          setUserAccess(null);
        }
      }
      try {
        const requests = (await api.listKycRequests(token, { search: overview.employee.employee_no })).requests;
        setProfileRequests(requests.filter((request) => request.employee_id === id));
      } catch {
        setProfileRequests([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load Employee 360 profile.");
    }
  }

  useEffect(() => {
    void load();
  }, [token, id, canView]);

  async function archive() {
    if (!token || !employee) return;
    try {
      await api.archiveEmployee(token, employee.id, archiveReason.trim());
      setArchiveReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive employee.");
    }
  }

  async function changeStatus(input: { status_id: string; reason?: string | null; exit_date?: string | null; exit_reason?: string | null }) {
    if (!token || !employee) return;
    setStatusSaving(true);
    setStatusModalError(null);
    try {
      await api.changeEmployeeStatus(token, employee.id, input);
      setStatusModalOpen(false);
      await load();
    } catch (err) {
      setStatusModalError(err instanceof ApiError ? err.message : "Unable to change status.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function updateTask(task: OnboardingTask, status: OnboardingStatus) {
    if (!token || !employee) return;
    try {
      await api.updateEmployeeOnboardingTask(token, employee.id, task.id, status);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update onboarding task.");
    }
  }

  async function saveContact(input: EmployeeContactInput) {
    if (!token || !employee) return;
    try {
      if (contactModal?.mode === "edit" && contactModal.contact) {
        await api.updateEmployeeContact(token, employee.id, contactModal.contact.id, input);
      } else {
        await api.createEmployeeContact(token, employee.id, input);
      }
      setContactModal(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save contact.");
    }
  }

  async function archiveContact(contact: EmployeeContact) {
    if (!token || !employee) return;
    try {
      await api.archiveEmployeeContact(token, employee.id, contact.id, contactArchiveReason);
      setContactArchiveTarget(null);
      setContactArchiveReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive contact.");
    }
  }

  async function applyUserAccessMapping(mappingId?: string | null) {
    if (!token || !employee) return;
    try {
      setUserAccess((await api.applyEmployeeRoleMapping(token, employee.id, mappingId)).preview);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to apply user access mapping.");
    }
  }

  if (!canView) {
    return <Panel><EmptyState title="Employee profile unavailable" description="Your account needs employees.view permission." /></Panel>;
  }
  if (!employee) {
    return <Panel><EmptyState title="Loading Employee 360" description={error ?? "Fetching employee profile."} /></Panel>;
  }

  const completed = onboarding.filter((task) => task.status === "COMPLETED").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <EmployeeAvatar employee={employee} token={token} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{employee.full_name}</h1>
              <Badge tone={tone(employee.status_key)}>{employee.status_name}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{employee.employee_no} · {employee.department_name ?? "No department"} · {employee.position_title ?? "No position"}</p>
            <p className="text-xs text-muted-foreground">{employee.location_name ?? "No location"} · {employee.job_level_name ?? "No job level"} · Joined {employee.joining_date ?? "-"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <EmployeeProfilePhotoControls employee={employee} token={token!} canUpload={canUploadPhoto} canClear={canClearPhoto} onChanged={load} />
          <Link to="/employees"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
          <Button variant="outline" size="sm" onClick={() => navigate("/employees")}><Pencil className="h-4 w-4" /> Edit</Button>
          {canStatus ? <Button variant="outline" size="sm" onClick={() => { setStatusModalError(null); setStatusModalOpen(true); }}>Change status</Button> : null}
          {canArchive ? <Button variant="danger" size="sm" onClick={() => setArchiveReason(" ")}><Archive className="h-4 w-4" /> Archive</Button> : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Panel className="overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {profileTabs.map((tab) => (
            <button key={tab} className={`h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === "Overview" ? (
            <Overview
              employee={employee}
              token={token!}
              contacts={contacts}
              onboarding={onboarding}
              completed={completed}
              audit={audit}
              photoControls={<EmployeeProfilePhotoControls employee={employee} token={token!} canUpload={canUploadPhoto} canClear={canClearPhoto} onChanged={load} compact />}
              onTask={canOnboarding ? updateTask : undefined}
            />
          ) : null}
          {activeTab === "Personal Info" ? <div className="space-y-4"><DetailGrid rows={[
            ["Full name", employee.full_name], ["Display name", employee.display_name], ["Gender", employee.gender], ["Date of birth", employee.date_of_birth], ["Nationality", employee.nationality], ["Employee type", employee.employee_type], ["Employment type", employee.employment_type], ["Profile photo", employee.profile_photo_document_id ? "Uploaded" : "Not uploaded"]
          ]} /><ProfileUpdateRequests rows={profileRequests} /></div> : null}
          {activeTab === "Job Info" ? <JobInfo employee={employee} jobHistory={jobHistory} /> : null}
          {activeTab === "Contacts" ? <Contacts contacts={contacts} canManage={canContacts} onAdd={() => setContactModal({ mode: "create" })} onEdit={(contact) => setContactModal({ mode: "edit", contact })} onArchive={(contact) => setContactArchiveTarget(contact)} /> : null}
          {activeTab === "User Access" ? canViewUserAccess ? <UserAccessPanel preview={userAccess} canApply={canApplyUserAccess} onApply={(mappingId) => void applyUserAccessMapping(mappingId)} /> : <EmptyState title="User access unavailable" description="Your account needs role_mappings.view permission." /> : null}
          {activeTab === "Payroll" ? (canPayroll ? <EmployeePayrollPanel employee={employee} /> : <Panel><EmptyState title="Payroll unavailable" description="Your account needs employee payroll access." /></Panel>) : null}
          {activeTab === "Attendance" ? canAttendance ? <EmployeeAttendancePanel employee={employee} token={token!} permissions={permissions} /> : <EmptyState title="Attendance unavailable" description="Your account needs employees.attendance.view permission." /> : null}
          {activeTab === "Roster" ? canRoster ? <EmployeeRosterPanel employee={employee} token={token!} permissions={permissions} /> : <EmptyState title="Roster unavailable" description="Your account needs employees.roster.view permission." /> : null}
          {activeTab === "Leave" ? canLeave ? <EmployeeLeavePanel employee={employee} token={token!} permissions={permissions} /> : <EmptyState title="Leave unavailable" description="Your account needs employees.leave.view permission." /> : null}
          {activeTab === "Documents" ? <EmployeeDocumentsPanel employee={employee} token={token!} permissions={permissions} onChanged={load} /> : null}
          {activeTab === "Assets & Uniforms" ? canAssets ? <EmployeeAssetsPanel employee={employee} /> : <EmptyState title="Assets unavailable" description="Your account needs employee asset access." /> : null}
          {activeTab === "Notes" ? canNotes ? <EmployeeNotesPanel employee={employee} /> : <EmptyState title="Notes unavailable" description="Your account needs employee_notes.view permission." /> : null}
          {activeTab === "Audit Log" ? canAudit ? <EmployeeAuditPanel employee={employee} initialAudit={audit} /> : <EmptyState title="Audit unavailable" description="Your account needs employee audit access." /> : null}
        </div>
      </Panel>

      {contactModal ? <ContactModal contact={contactModal.contact} onClose={() => setContactModal(null)} onSave={(input) => void saveContact(input)} /> : null}
      {archiveReason ? (
        <ReasonModal
          title="Archive employee"
          description={`Archive ${employee.full_name}. Existing history is retained.`}
          value={archiveReason.trim() === "" ? "" : archiveReason}
          onChange={setArchiveReason}
          onClose={() => setArchiveReason("")}
          onConfirm={() => void archive()}
        />
      ) : null}
      {contactArchiveTarget ? (
        <ReasonModal
          title="Archive contact"
          description={`Archive ${contactArchiveTarget.contact_type} contact ${contactArchiveTarget.value}.`}
          value={contactArchiveReason}
          onChange={setContactArchiveReason}
          onClose={() => { setContactArchiveTarget(null); setContactArchiveReason(""); }}
          onConfirm={() => void archiveContact(contactArchiveTarget)}
        />
      ) : null}
      {statusModalOpen ? (
        <ChangeEmployeeStatusModal
          employee={employee}
          statuses={statuses}
          error={statusModalError}
          saving={statusSaving}
          onClose={() => setStatusModalOpen(false)}
          onSubmit={(input) => void changeStatus(input)}
        />
      ) : null}
    </div>
  );
}

function Overview({
  employee,
  token,
  contacts,
  onboarding,
  completed,
  audit,
  photoControls,
  onTask
}: {
  employee: Employee;
  token: string;
  contacts: EmployeeContact[];
  onboarding: OnboardingTask[];
  completed: number;
  audit: Record<string, unknown>[];
  photoControls: ReactNode;
  onTask?: (task: OnboardingTask, status: OnboardingStatus) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-md border">
        <div className="border-b px-3 py-2 text-sm font-semibold">Profile photo</div>
        <div className="flex items-center gap-3 p-3">
          <EmployeeAvatar employee={employee} token={token} size="lg" />
          <div className="min-w-0 space-y-2">
            <div>
              <p className="truncate text-sm font-medium">{employee.full_name}</p>
              <p className="text-xs text-muted-foreground">{employee.profile_photo_document_id ? "Photo uploaded" : "Initials placeholder"}</p>
            </div>
            {photoControls}
          </div>
        </div>
      </div>
      <Summary title="Personal summary" rows={[["Display name", employee.display_name ?? "-"], ["Employee type", employee.employee_type], ["Employment type", employee.employment_type]]} />
      <Summary title="Job summary" rows={[["Department", employee.department_name ?? "-"], ["Position", employee.position_title ?? "-"], ["Location", employee.location_name ?? "-"], ["Manager", employee.reporting_manager_name ?? "-"]]} />
      <Summary title="Contact summary" rows={[["Contacts", String(contacts.length)], ["Primary", contacts.find((c) => c.is_primary)?.value ?? "-"], ["Emergency", contacts.find((c) => c.contact_type === "EMERGENCY")?.value ?? "-"]]} />
      <div className="xl:col-span-2"><OnboardingTable tasks={onboarding} completed={completed} onTask={onTask} /></div>
      <Placeholder title="Alerts" items={["Missing documents", "Expiring documents", "Attendance issues", "Pending leave", "Asset clearance"]} />
      <div className="xl:col-span-3"><AuditTable audit={audit.slice(0, 6)} /></div>
    </div>
  );
}

function UserAccessPanel({ preview, canApply, onApply }: { preview: EmployeeUserAccessPreview | null; canApply: boolean; onApply: (mappingId?: string | null) => void }) {
  if (!preview) return <EmptyState title="User access loading" description="Fetching linked user roles and access scopes." />;
  const mapping = preview.suggested_role_mapping;
  const listIds = (value?: string[]) => value?.length ? value.join(", ") : "-";
  const scopeSource = (scope: EmployeeUserAccessPreview["assigned_scopes"][number]) => {
    if (scope.scope_owner_type === "ROLE") return "Role";
    if (scope.scope_owner_type === "ROLE_MAPPING_RULE") return "Mapping template";
    return scope.role_mapping_rule_id ? "Applied mapping" : "Manual user scope";
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <Summary title="Linked user" rows={[["Status", preview.linked_user ? "Linked" : "No linked user"], ["Email", preview.linked_user?.email ?? "-"]]} />
        <Summary title="Suggested role" rows={[["Role", preview.suggested_role?.name ?? "-"], ["Mapping", mapping?.name ?? "-"], ["Priority", mapping ? String(mapping.priority) : "-"]]} />
        <Summary title="Suggested scope" rows={[["Scope", preview.suggested_scope?.scope_type ?? "-"], ["Departments", listIds(preview.suggested_scope?.allowed_department_ids)], ["Locations", listIds(preview.suggested_scope?.allowed_location_ids)], ["Manage", preview.suggested_scope?.can_manage ? "Yes" : "No"]]} />
      </div>
      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        Roles define permissions. Access scopes define the employee, department, and location records those permissions can reach. Role mapping templates are copied to the linked user when applied.
      </div>
      <div className="flex justify-end">
        {canApply && preview.linked_user && mapping ? <Button size="sm" onClick={() => onApply(mapping.id)}>Apply suggested mapping</Button> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-semibold">Assigned roles</div>
          <div className="divide-y">{preview.assigned_roles.length ? preview.assigned_roles.map((role) => <div key={role.id} className="px-3 py-2 text-sm">{role.name}</div>) : <div className="px-3 py-4 text-sm text-muted-foreground">No roles assigned.</div>}</div>
        </div>
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-semibold">Assigned scopes</div>
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Source</TableHead><TableHead>Scope</TableHead><TableHead>Module</TableHead><TableHead>Departments</TableHead><TableHead>Locations</TableHead><TableHead>Rights</TableHead></TableRow></TableHeader>
              <TableBody>{preview.assigned_scopes.map((scope) => <TableRow key={scope.id}><TableCell>{scope.name}</TableCell><TableCell>{scopeSource(scope)}</TableCell><TableCell>{scope.scope_type}</TableCell><TableCell>{scope.module_key ?? "All"}</TableCell><TableCell>{listIds(scope.allowed_department_ids)}</TableCell><TableCell>{listIds(scope.allowed_location_ids)}</TableCell><TableCell>{scope.can_manage ? "Manage" : scope.can_view ? "View" : "-"}</TableCell></TableRow>)}</TableBody>
            </Table>
            {!preview.assigned_scopes.length ? <div className="px-3 py-4 text-sm text-muted-foreground">No user-specific scopes assigned.</div> : null}
          </div>
        </div>
      </div>
      {!preview.linked_user ? <EmptyState title="No linked system user" description="Role mapping can be applied after this employee is linked to a user account." /> : null}
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className="rounded-md border"><div className="border-b px-3 py-2 text-sm font-semibold">{title}</div><div className="divide-y">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}</div></div>;
}

function DetailGrid({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  return <div className="grid gap-3 md:grid-cols-3">{rows.map(([k, v]) => <div key={k} className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{k}</p><p className="text-sm font-medium">{v || "-"}</p></div>)}</div>;
}

function parseFieldValue(json?: unknown) {
  if (!json) return "-";
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => `${key}: ${String(value ?? "-")}`).join(", ");
    }
    return String(parsed ?? "-");
  } catch {
    return String(json);
  }
}

function ProfileUpdateRequests({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="rounded-md border">
      <div className="border-b px-3 py-2 text-sm font-semibold">Profile update requests</div>
      {rows.length === 0 ? <EmptyState title="No profile update requests" description="Pending and recent self-service profile requests for this employee will appear here." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Old/current value</TableHead><TableHead>Requested value</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Reviewer note</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={String(row.id)}><TableCell>{String(row.field_key ?? row.section ?? "-")}</TableCell><TableCell>{parseFieldValue(row.old_value_json)}</TableCell><TableCell>{parseFieldValue(row.requested_value_json)}</TableCell><TableCell>{String(row.reason ?? "-")}</TableCell><TableCell><Badge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>{String(row.status ?? "-")}</Badge></TableCell><TableCell>{String(row.review_note ?? "-")}</TableCell><TableCell>{String(row.created_at ?? "-")}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ReasonModal({ title, description, value, onChange, onClose, onConfirm }: { title: string; description: string; value: string; onChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <Input className="mt-3" placeholder="Reason" value={value === " " ? "" : value} onChange={(event) => onChange(event.target.value || " ")} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!value.trim()} onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

function JobInfo({ employee, jobHistory }: { employee: Employee; jobHistory: Record<string, unknown>[] }) {
  return <div className="space-y-4"><DetailGrid rows={[["Department", employee.department_name], ["Position", employee.position_title], ["Outlet/location", employee.location_name], ["Job level", employee.job_level_name], ["Reporting manager", employee.reporting_manager_name], ["Joining date", employee.joining_date], ["Confirmation date", employee.confirmation_date], ["Contract dates", `${employee.contract_start_date ?? "-"} to ${employee.contract_end_date ?? "-"}`], ["Probation end", employee.probation_end_date], ["Payroll included", employee.payroll_included ? "Yes" : "No"], ["Roster eligible", employee.roster_eligible ? "Yes" : "No"]]} /><SimpleRows title="Job history" rows={jobHistory} columns={["effective_date", "previous_department_name", "new_department_name", "previous_position_title", "new_position_title", "reason", "created_by_name", "created_at"]} /></div>;
}

function Contacts({
  contacts,
  canManage,
  onAdd,
  onEdit,
  onArchive
}: {
  contacts: EmployeeContact[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (contact: EmployeeContact) => void;
  onArchive: (contact: EmployeeContact) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{canManage ? <Button size="sm" onClick={onAdd}>Add contact</Button> : null}</div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Primary</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Sensitive</TableHead>
              <TableHead>Notes</TableHead>
              {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>{contact.contact_type}</TableCell>
                <TableCell>{contact.value}</TableCell>
                <TableCell>{contact.country_code ?? "-"}</TableCell>
                <TableCell>{contact.relationship ?? "-"}</TableCell>
                <TableCell>{contact.is_primary ? "Yes" : "No"}</TableCell>
                <TableCell>{contact.emergency_priority ?? "-"}</TableCell>
                <TableCell>{contact.is_sensitive ? <Badge tone="warning">Sensitive</Badge> : "-"}</TableCell>
                <TableCell>{contact.notes ?? "-"}</TableCell>
                {canManage ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(contact)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => onArchive(contact)}>Archive</Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function OnboardingTable({ tasks, completed, onTask }: { tasks: OnboardingTask[]; completed: number; onTask?: (task: OnboardingTask, status: OnboardingStatus) => Promise<void> }) {
  return <div className="rounded-md border"><div className="flex items-center justify-between border-b px-3 py-2"><div><h3 className="text-sm font-semibold">Onboarding checklist</h3><p className="text-xs text-muted-foreground">{completed}/{tasks.length} completed</p></div><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Module</TableHead><TableHead>Required</TableHead><TableHead>Status</TableHead><TableHead>Completed at</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{tasks.map((task) => <TableRow key={task.id}><TableCell>{task.title}</TableCell><TableCell>{task.module}</TableCell><TableCell>{task.required ? "Yes" : "No"}</TableCell><TableCell><Badge tone={task.status === "COMPLETED" ? "success" : task.status === "BLOCKED" ? "danger" : "neutral"}>{task.status}</Badge></TableCell><TableCell>{task.completed_at ?? "-"}</TableCell><TableCell>{onTask ? <div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => void onTask(task, "COMPLETED")}>Done</Button><Button variant="outline" size="sm" onClick={() => void onTask(task, "SKIPPED")}>Skip</Button><Button variant="outline" size="sm" onClick={() => void onTask(task, "BLOCKED")}>Block</Button>{task.status !== "PENDING" ? <Button variant="outline" size="sm" onClick={() => void onTask(task, "PENDING")}>Reopen</Button> : null}</div> : "-"}</TableCell></TableRow>)}</TableBody></Table></div></div>;
}

function Placeholder({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-md border"><div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">{title} not implemented yet</h3><p className="text-xs text-muted-foreground">Foundation sections prepared for a later module prompt.</p></div><div className="grid gap-2 p-3 md:grid-cols-3">{items.map((item) => <Badge key={item} tone="neutral">{item}</Badge>)}</div></div>;
}

function AuditTable({ audit }: { audit: Record<string, unknown>[] }) {
  return <SimpleRows title="Recent audit activity" rows={audit} columns={["action", "entity_type", "reason", "created_at"]} />;
}

function SimpleRows({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns: string[] }) {
  return <div className="rounded-md border"><div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>{rows.length === 0 ? <EmptyState title="No records yet" description="Activity will appear here as Employee 360 changes are made." /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((c) => <TableHead key={c}>{c.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((c) => <TableCell key={c}>{String(row[c] ?? "-")}</TableCell>)}</TableRow>)}</TableBody></Table></div>}</div>;
}

function ContactModal({ contact, onClose, onSave }: { contact?: EmployeeContact; onClose: () => void; onSave: (input: EmployeeContactInput) => void }) {
  const [form, setForm] = useState<EmployeeContactInput>({
    contact_type: contact?.contact_type ?? "PERSONAL_PHONE",
    value: contact?.value ?? "",
    country_code: contact?.country_code ?? "",
    relationship: contact?.relationship ?? "",
    is_primary: contact?.is_primary ?? false,
    emergency_priority: contact?.emergency_priority ?? null,
    is_sensitive: contact?.is_sensitive ?? false,
    notes: contact?.notes ?? ""
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{contact ? "Edit contact" : "Add contact"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><div className="space-y-1.5"><Label>Type</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.contact_type} onChange={(e) => setForm({ ...form, contact_type: e.target.value as EmployeeContactInput["contact_type"] })}>{["PERSONAL_PHONE","WORK_PHONE","PERSONAL_EMAIL","WORK_EMAIL","EMERGENCY","GUARDIAN","SPOUSE","PARENT","OTHER"].map((type) => <option key={type} value={type}>{type}</option>)}</select></div><Field label="Value" value={form.value} onChange={(value) => setForm({ ...form, value })} /><Field label="Country code" value={form.country_code ?? ""} onChange={(country_code) => setForm({ ...form, country_code })} /><Field label="Relationship" value={form.relationship ?? ""} onChange={(relationship) => setForm({ ...form, relationship })} /><Field label="Priority" value={form.emergency_priority?.toString() ?? ""} onChange={(value) => setForm({ ...form, emergency_priority: value ? Number(value) : null })} /><Field label="Notes" value={form.notes ?? ""} onChange={(notes) => setForm({ ...form, notes })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} /> Primary</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_sensitive} onChange={(e) => setForm({ ...form, is_sensitive: e.target.checked })} /> Sensitive</label></div><div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onSave(form)}>Save</Button></div></div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
