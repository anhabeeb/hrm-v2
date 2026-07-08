import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CircleCheck, CircleDashed, Laptop, Plus, Upload, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import type { EmployeeSetupReadiness, EmployeeSetupSectionStatusRow } from "../types/employees";
import type { Role } from "../types/auth";

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (`${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`).toUpperCase() || "E";
}
function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 84 84" aria-hidden="true" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#E7E7F1" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#5B4FE9" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="500" fill="#14162B">{percent}%</text>
    </svg>
  );
}

type TileKey = "personal" | "documents" | "payment_method" | "payroll_profile" | "user_access" | "assets_uniforms";

const TILES: Array<{ key: TileKey; label: string; sectionKeys: string[] }> = [
  { key: "personal", label: "Personal information & contacts", sectionKeys: ["employee_info", "contact_emergency"] },
  { key: "documents", label: "Required documents", sectionKeys: ["documents"] },
  { key: "payment_method", label: "Bank account verification", sectionKeys: ["payment_method"] },
  { key: "payroll_profile", label: "Payroll profile", sectionKeys: ["payroll_profile"] },
  { key: "user_access", label: "User account provisioning", sectionKeys: ["user_access"] },
  { key: "assets_uniforms", label: "Uniform & asset assignment", sectionKeys: ["assets_uniforms"] }
];

// job_assignment is satisfied at case creation (Start Onboarding modal). contract/pension/attendance_roster
// default to not-required and have no dedicated tile here — if a company turns them on, they still count
// against the ring and surface via the "additional required items" banner, so nothing is silently dropped.
const OTHER_SECTION_KEYS = ["job_assignment", "contract", "pension", "attendance_roster", "approval_tasks"];

type CombinedStatus = "complete" | "blocked" | "pending" | "not_required" | "unknown";

function combineSectionStatus(sections: EmployeeSetupSectionStatusRow[], keys: string[]): { status: CombinedStatus; message: string } {
  const rows = keys.map((key) => sections.find((s) => s.section_key === key)).filter(Boolean) as EmployeeSetupSectionStatusRow[];
  if (!rows.length) return { status: "unknown", message: "Status not available yet." };
  if (rows.every((r) => r.status === "not_required")) return { status: "not_required", message: "Not required for this employee." };
  const notReady = rows.find((r) => !["complete", "verified", "not_required"].includes(r.status));
  if (notReady) {
    const status: CombinedStatus = notReady.status === "blocked" || notReady.status === "failed" ? "blocked" : "pending";
    return { status, message: notReady.next_action || notReady.status_message || "Needs attention." };
  }
  const sortedDates = rows.map((r) => r.last_saved_at ?? r.updated_at).filter(Boolean).sort();
  const completedAt = sortedDates[sortedDates.length - 1];
  return { status: "complete", message: completedAt ? `Completed ${String(completedAt).slice(0, 10)}` : "Complete." };
}

function tileVisual(status: CombinedStatus) {
  if (status === "complete") return { Icon: CircleCheck, color: "#27500A", badge: <Badge tone="success">Complete</Badge>, dim: false };
  if (status === "blocked") return { Icon: AlertCircle, color: "#A32D2D", badge: <Badge tone="danger">Blocked</Badge>, dim: false };
  if (status === "not_required") return { Icon: CircleDashed, color: "#9A9DB0", badge: <Badge tone="neutral">Not required</Badge>, dim: true };
  return { Icon: CircleDashed, color: "#854F0B", badge: <Badge tone="warning">Pending</Badge>, dim: false };
}

export function OnboardingCaseWorkspacePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);

  const [workspace, setWorkspace] = useState<Row | null>(null);
  const [sections, setSections] = useState<EmployeeSetupSectionStatusRow[]>([]);
  const [readiness, setReadiness] = useState<EmployeeSetupReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTile, setActiveTile] = useState<TileKey | null>(null);
  const [activating, setActivating] = useState(false);

  async function load() {
    if (!token || !caseId) return;
    setLoading(true);
    setError(null);
    try {
      const [wsResult, readinessResult] = await Promise.all([
        api.getOnboardingWorkspace(token, caseId),
        api.getOnboardingSectionReadiness(token, caseId)
      ]);
      setWorkspace(asRow(wsResult.workspace));
      let sectionRows = (readinessResult.sections ?? []) as unknown as EmployeeSetupSectionStatusRow[];
      let readinessValue = (readinessResult.readiness ?? null) as unknown as EmployeeSetupReadiness | null;
      // Freshly created cases carry a generic "not evaluated yet" placeholder per section until
      // a rebuild runs once — resolve it immediately so the checklist shows real, specific reasons.
      if (sectionRows.some((row) => row.status_reason_code === "SECTION_NOT_EVALUATED")) {
        const rebuilt = await api.rebuildOnboardingSectionStatuses(token, caseId);
        sectionRows = (rebuilt.sections ?? []) as unknown as EmployeeSetupSectionStatusRow[];
        readinessValue = (rebuilt.readiness ?? null) as unknown as EmployeeSetupReadiness | null;
      }
      setSections(sectionRows);
      setReadiness(readinessValue);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load onboarding case.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, caseId]);

  async function reload() {
    await load();
  }

  if (!caseId) return null;

  if (loading && !workspace) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
      </PageShell>
    );
  }

  if (error && !workspace) {
    return (
      <PageShell constrained={false}>
        <Panel className="p-4"><EmptyState title="Unable to load onboarding case" description={error} /></Panel>
      </PageShell>
    );
  }

  if (!workspace) return null;

  const caseRow = asRow(workspace.case);
  const employee = asRow(workspace.employee);
  const employeeId = text(employee.id ?? caseRow.employee_id);
  const name = text(employee.full_name ?? caseRow.employee_name, "Employee");
  const color = colorFor(name);
  const roleLine = [text(caseRow.position_name), text(caseRow.department_name)].filter(Boolean).join(" · ");
  const startLine = caseRow.planned_start_date ? `Starts ${text(caseRow.planned_start_date)}` : "";

  const relevantSections = sections.filter((s) => s.status !== "not_required");
  const completeCount = relevantSections.filter((s) => s.status === "complete" || s.status === "verified").length;
  const pct = relevantSections.length ? Math.round((completeCount / relevantSections.length) * 100) : 0;

  const otherBlocking = sections.filter((s) => OTHER_SECTION_KEYS.includes(s.section_key) && s.is_required && !["complete", "verified", "not_required"].includes(s.status));

  const canActivate = pct === 100 && !otherBlocking.length;

  const canEditPersonal = permissions.has("onboarding.workspace.update") || permissions.has("onboarding.cases.manage") || permissions.has("employees.update");
  const canEditDocuments = permissions.has("onboarding.workspace.documents.upload") || permissions.has("documents.upload") || permissions.has("onboarding.cases.manage");
  const canEditPayment = permissions.has("onboarding.workspace.payment_methods.update") || permissions.has("employees.payment_methods.manage") || permissions.has("payroll.payment_methods.manage") || permissions.has("onboarding.cases.manage");
  const canVerifyPayment = permissions.has("employees.payment_methods.verify") || permissions.has("employees.payment_methods.manage") || permissions.has("payroll.payment_methods.manage");
  const canEditPayroll = permissions.has("onboarding.workspace.payroll.update") || permissions.has("employees.payroll.update") || permissions.has("payroll.manage") || permissions.has("onboarding.cases.manage");
  const canEditUserAccess = permissions.has("onboarding.workspace.user_access.update") || permissions.has("users.create") || permissions.has("users.update") || permissions.has("onboarding.cases.manage");
  const canEditAssets = permissions.has("onboarding.workspace.assets.update") || permissions.has("assets.issue") || permissions.has("assets.manage") || permissions.has("onboarding.cases.manage");

  async function runActivate() {
    if (!token || !caseId) return;
    setActivating(true);
    try {
      const finalResult = await api.finalVerifyOnboardingActivation(token, caseId);
      const verification = asRow(finalResult.verification);
      if (!verification.can_activate) {
        const blockers = asRows(verification.blockers);
        alerts.showWarning("Not ready to activate", blockers[0] ? text(blockers[0].message, "Some sections still need attention.") : "Some sections still need attention.");
        await reload();
        return;
      }
      await api.activateOnboardingCase(token, caseId);
      alerts.showSuccess("Employee activated", `${name} has been activated.`);
      await reload();
    } catch (err) {
      alerts.showApiError(err, "Unable to activate employee.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <Link to="/v3-preview/onboarding" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Onboarding / {name}
        </Link>

        <Panel className="flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(name)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-950">{name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{[roleLine, startLine].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <ProgressRing percent={pct} />
        </Panel>

        {otherBlocking.length ? (
          <Panel className="p-3 text-xs" style={{ background: "#FAEEDA", borderColor: "#FAC775" }}>
            <span className="font-medium text-[#854F0B]">{otherBlocking.length} additional required item{otherBlocking.length > 1 ? "s" : ""}</span>
            <span className="text-[#854F0B]"> ({otherBlocking.map((s) => s.section_label).join(", ")}) not shown here — manage from </span>
            {employeeId ? <Link to={`/employees/${employeeId}?setup=1`} className="font-medium text-[#854F0B] underline">Employee 360</Link> : <span className="font-medium text-[#854F0B]">Employee 360</span>}
          </Panel>
        ) : null}

        {error ? <Panel className="p-3 text-xs text-[#A32D2D]">{error}</Panel> : null}

        <div className="flex flex-col gap-2">
          {TILES.map((tile) => {
            const combined = combineSectionStatus(sections, tile.sectionKeys);
            const visual = tileVisual(combined.status);
            const canEdit =
              tile.key === "personal" ? canEditPersonal :
              tile.key === "documents" ? canEditDocuments :
              tile.key === "payment_method" ? canEditPayment :
              tile.key === "payroll_profile" ? canEditPayroll :
              tile.key === "user_access" ? canEditUserAccess :
              canEditAssets;

            if (tile.key === "payment_method") {
              return (
                <BankVerificationRow
                  key={tile.key}
                  label={tile.label}
                  combined={combined}
                  visual={visual}
                  workspace={workspace}
                  employeeId={employeeId}
                  canEditPayment={canEditPayment}
                  canVerifyPayment={canVerifyPayment}
                  onOpenDialog={() => setActiveTile(tile.key)}
                  onChanged={reload}
                />
              );
            }

            const showAction = combined.status !== "complete" && combined.status !== "not_required" && canEdit;
            return (
              <Panel key={tile.key} className="flex items-center gap-3.5 p-3" style={visual.dim ? { opacity: 0.6 } : undefined}>
                <visual.Icon className="h-[18px] w-[18px] shrink-0" style={{ color: visual.color }} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveTile(tile.key)}>
                  <p className="text-xs font-medium text-slate-950">{tile.label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{combined.message}</p>
                </button>
                {visual.badge}
                {showAction ? <Button size="sm" variant="actionSave" onClick={() => setActiveTile(tile.key)}>Mark complete</Button> : null}
              </Panel>
            );
          })}
        </div>

        {canActivate ? (
          <div className="flex justify-end">
            <Button loading={activating} onClick={() => void runActivate()}>Activate employee</Button>
          </div>
        ) : null}
      </div>

      {activeTile === "personal" ? <PersonalInfoDialog workspace={workspace} caseId={caseId} employeeId={employeeId} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
      {activeTile === "documents" ? <DocumentsDialog workspace={workspace} caseId={caseId} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
      {activeTile === "payment_method" ? <BankVerificationDialog workspace={workspace} caseId={caseId} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
      {activeTile === "payroll_profile" ? <PayrollProfileDialog workspace={workspace} caseId={caseId} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
      {activeTile === "user_access" ? <UserAccountDialog workspace={workspace} caseId={caseId} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
      {activeTile === "assets_uniforms" ? <AssetsUniformsDialog workspace={workspace} caseId={caseId} permissions={permissions} onClose={() => setActiveTile(null)} onSaved={reload} /> : null}
    </PageShell>
  );
}

function BankVerificationRow({ label, combined, visual, workspace, employeeId, canEditPayment, canVerifyPayment, onOpenDialog, onChanged }: {
  label: string;
  combined: { status: CombinedStatus; message: string };
  visual: ReturnType<typeof tileVisual>;
  workspace: Row;
  employeeId: string;
  canEditPayment: boolean;
  canVerifyPayment: boolean;
  onOpenDialog: () => void;
  onChanged: () => Promise<void>;
}) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [verifying, setVerifying] = useState(false);
  const paymentRow = asRows(asRow(workspace.sections).payment_methods)[0];
  const isVerified = text(paymentRow?.verification_status) === "VERIFIED";
  const displayComplete = combined.status === "complete" && (isVerified || !paymentRow);
  const visualEffective = displayComplete ? visual : (combined.status === "not_required" ? visual : tileVisual(combined.status === "complete" ? "pending" : combined.status));
  const message = combined.status === "complete" && !isVerified && paymentRow ? "Needs Finance sign-off before this section is complete" : combined.message;

  async function verify() {
    if (!token || !paymentRow) return;
    setVerifying(true);
    try {
      await api.verifyEmployeePaymentMethod(token, employeeId, text(paymentRow.id));
      alerts.showSuccess("Payment method verified");
      await onChanged();
    } catch (err) {
      alerts.showApiError(err, "Unable to verify payment method.");
    } finally {
      setVerifying(false);
    }
  }

  let action = null;
  if (!displayComplete && combined.status !== "not_required") {
    if (paymentRow && !isVerified && canVerifyPayment) {
      action = <Button size="sm" variant="actionSave" loading={verifying} onClick={() => void verify()}>Verify</Button>;
    } else if (canEditPayment) {
      action = <Button size="sm" variant="actionNeutral" onClick={onOpenDialog}>{paymentRow ? "Request sign-off" : "Add bank details"}</Button>;
    }
  }

  return (
    <Panel className="flex items-center gap-3.5 p-3" style={visualEffective.dim ? { opacity: 0.6 } : undefined}>
      <visualEffective.Icon className="h-[18px] w-[18px] shrink-0" style={{ color: visualEffective.color }} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpenDialog}>
        <p className="text-xs font-medium text-slate-950">{label}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{message}</p>
      </button>
      {displayComplete ? <Badge tone="success">Complete</Badge> : visualEffective.badge}
      {action}
    </Panel>
  );
}

function PersonalInfoDialog({ workspace, caseId, employeeId, onClose, onSaved }: { workspace: Row; caseId: string; employeeId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const employee = asRow(workspace.employee);
  const contacts = asRows(asRow(workspace.sections).contacts);
  const addresses = asRows(asRow(workspace.sections).addresses);
  const findContact = (type: string) => contacts.find((c) => c.contact_type === type);
  const currentAddress = addresses.find((a) => a.address_type === "CURRENT");

  const [form, setForm] = useState({
    full_name: text(employee.full_name),
    date_of_birth: text(employee.date_of_birth),
    gender: text(employee.gender),
    nationality: text(employee.nationality),
    work_email: text(findContact("WORK_EMAIL")?.value),
    personal_email: text(findContact("PERSONAL_EMAIL")?.value),
    phone: text(findContact("PERSONAL_PHONE")?.value),
    address_line: text(currentAddress?.address_line),
    island_city: text(currentAddress?.island_city),
    country: text(currentAddress?.country)
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emergencyContacts = contacts
    .filter((c) => c.contact_type === "EMERGENCY")
    .sort((a, b) => Number(a.emergency_priority ?? 99) - Number(b.emergency_priority ?? 99));
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ value: "", relationship: "" });
  const [contactBusy, setContactBusy] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        api.updateOnboardingWorkspaceEmployeeInfo(token, caseId, {
          full_name: form.full_name,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          nationality: form.nationality || null
        }),
        api.updateOnboardingWorkspaceContactInfo(token, caseId, {
          work_email: form.work_email,
          personal_email: form.personal_email,
          phone: form.phone,
          address_line: form.address_line,
          island_city: form.island_city,
          country: form.country
        })
      ]);
      alerts.showSuccess("Personal information saved");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save personal information.");
    } finally {
      setSaving(false);
    }
  }

  async function addEmergencyContact() {
    if (!token || !newContact.value.trim()) return;
    setContactBusy(true);
    try {
      await api.createEmployeeContact(token, employeeId, {
        contact_type: "EMERGENCY",
        value: newContact.value.trim(),
        relationship: newContact.relationship.trim() || null,
        is_primary: emergencyContacts.length === 0,
        emergency_priority: emergencyContacts.length + 1,
        is_sensitive: false
      });
      setNewContact({ value: "", relationship: "" });
      setAddingContact(false);
      await onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to add emergency contact.");
    } finally {
      setContactBusy(false);
    }
  }

  async function removeEmergencyContact(contactId: string) {
    if (!token) return;
    try {
      await api.archiveEmployeeContact(token, employeeId, contactId, "Removed from onboarding workspace.");
      await onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to remove emergency contact.");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Personal information & contacts</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-950">Personal data</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5"><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Gender</Label><Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></div>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-950">Contact</p>
              <p className="mb-2 text-[10px] text-muted-foreground">Office email is used to create the login account — personal email is for reference only.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Office email *</Label><Input type="email" value={form.work_email} onChange={(e) => setForm({ ...form, work_email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Personal email</Label><Input type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Address</Label><Input value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Island/city</Label><Input value={form.island_city} onChange={(e) => setForm({ ...form, island_city: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-950">Emergency contacts</p>
                <button type="button" className="text-[11px] font-medium text-primary" onClick={() => setAddingContact(true)}><Plus className="mr-1 inline h-3 w-3" />Add another</button>
              </div>
              <div className="space-y-2">
                {emergencyContacts.map((contact, index) => (
                  <div key={text(contact.id)} className="grid grid-cols-[24px_1fr_1fr_auto] items-center gap-2.5 rounded-md bg-[#F7F7FB] px-2.5 py-2">
                    <span className="rounded bg-white py-0.5 text-center text-[9px] font-medium text-muted-foreground">P{index + 1}</span>
                    <span className="truncate text-xs text-slate-950">{text(contact.value)}</span>
                    <span className="truncate text-xs text-muted-foreground">{text(contact.relationship, "—")}</span>
                    <button type="button" onClick={() => void removeEmergencyContact(text(contact.id))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                ))}
                {addingContact ? (
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-md border border-dashed border-[#D3D3E3] p-2.5">
                    <Input placeholder="Name and/or phone" value={newContact.value} onChange={(e) => setNewContact({ ...newContact, value: e.target.value })} />
                    <Input placeholder="Relationship" value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} />
                    <Button size="sm" loading={contactBusy} disabled={!newContact.value.trim()} onClick={() => void addEmergencyContact()}>Add</Button>
                  </div>
                ) : null}
                {!emergencyContacts.length && !addingContact ? <p className="text-xs text-muted-foreground">No emergency contacts added yet.</p> : null}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!form.full_name.trim() || !form.work_email.trim()} onClick={() => void save()}>Save & mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsDialog({ workspace, caseId, onClose, onSaved }: { workspace: Row; caseId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const documentRows = asRows(asRow(asRow(workspace.sections).documents).rows);
  const documentTypes = asRows(asRow(workspace.refs).document_types);
  const [uploadingFor, setUploadingFor] = useState<Row | null>(null);

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Required documents</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              {documentRows.length ? documentRows.map((row) => {
                const uploaded = Boolean(row.current_employee_document_id) && text(row.status) !== "MISSING";
                const doc = asRow(row.document);
                return (
                  <Panel key={text(row.document_type_id)} className="flex items-center gap-3.5 p-3" style={!uploaded ? { borderStyle: "dashed", borderWidth: 1.5, borderColor: "#D3D3E3" } : undefined}>
                    <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg" style={{ background: uploaded ? "#EAF3DE" : "#F7F7FB" }}>
                      <Upload className="h-3.5 w-3.5" style={{ color: uploaded ? "#27500A" : "#9A9DB0" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{text(row.document_type_name)}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{uploaded ? text(doc.original_filename, "Uploaded") : row.waived ? "Waived" : "Required · not yet uploaded"}</p>
                    </div>
                    {uploaded ? <Badge tone="success">Uploaded</Badge> : <Button size="sm" variant="actionNeutral" onClick={() => setUploadingFor(row)}>Upload</Button>}
                  </Panel>
                );
              }) : <EmptyState title="No document rules apply" description="No required document rules match this employee yet." />}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {uploadingFor ? (
        <UploadOnboardingDocumentDialog
          caseId={caseId}
          row={uploadingFor}
          documentType={documentTypes.find((t) => text(t.id) === text(uploadingFor.document_type_id))}
          onClose={() => setUploadingFor(null)}
          onSaved={async () => { setUploadingFor(null); await onSaved(); }}
        />
      ) : null}
    </>
  );
}

function UploadOnboardingDocumentDialog({ caseId, row, documentType, onClose, onSaved }: { caseId: string; row: Row; documentType?: Row; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !file) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("document_type_id", text(row.document_type_id));
      if (documentNumber) form.append("document_number", documentNumber);
      if (issueDate) form.append("issue_date", issueDate);
      if (expiryDate) form.append("expiry_date", expiryDate);
      await api.uploadOnboardingWorkspaceDocument(token, caseId, form);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Upload {text(row.document_type_name)}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>File</Label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded-md border border-dashed border-[#D3D3E3] bg-[#F7F7FB] p-3 text-xs" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Issue date{documentType?.requires_issue_date ? " (required)" : ""}</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Expiry date{documentType?.requires_expiry_date ? " (required)" : ""}</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            </div>
            {documentType?.requires_document_number ? <div className="space-y-1.5"><Label>Document number (required)</Label><Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></div> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!file || (Boolean(documentType?.requires_document_number) && !documentNumber) || (Boolean(documentType?.requires_issue_date) && !issueDate) || (Boolean(documentType?.requires_expiry_date) && !expiryDate)}
            onClick={() => void submit()}
          >
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankVerificationDialog({ workspace, caseId, onClose, onSaved }: { workspace: Row; caseId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const refs = asRow(workspace.refs);
  const existing = asRows(asRow(workspace.sections).payment_methods)[0] ?? {};
  const banks = asRows(refs.payment_institutions).filter((b) => text(b.type) === "BANK" && text(b.status) === "ACTIVE");
  const [form, setForm] = useState({
    payment_method_type: text(existing.payment_method_type, "BANK_TRANSFER"),
    payment_institution_id: text(existing.payment_institution_id),
    bank_account_name: text(existing.bank_account_name),
    bank_account_number: "",
    currency: text(existing.currency, "MVR")
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBank = form.payment_method_type === "BANK_TRANSFER";

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.createOnboardingWorkspacePaymentMethod(token, caseId, {
        payment_method_type: form.payment_method_type,
        payment_institution_id: isBank ? form.payment_institution_id : "",
        bank_account_name: isBank ? form.bank_account_name : "",
        bank_account_number: isBank ? form.bank_account_number : "",
        currency: form.currency,
        is_primary: true,
        notes: ""
      });
      alerts.showSuccess("Bank details saved", "Waiting on Finance to verify.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save bank details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Bank account verification</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <SelectField value={form.payment_method_type} onValueChange={(v) => setForm({ ...form, payment_method_type: v })}>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            {isBank ? (
              <>
                <div className="space-y-1.5">
                  <Label>Bank *</Label>
                  <SelectField value={form.payment_institution_id} onValueChange={(v) => setForm({ ...form, payment_institution_id: v })}>
                    <option value="">Select active bank</option>
                    {banks.map((b) => <option key={text(b.id)} value={text(b.id)}>{text(b.name)}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5"><Label>Account holder name *</Label><Input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Account number *</Label>
                  <Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} placeholder={existing.id ? "Re-enter to change the saved account number" : undefined} />
                </div>
              </>
            ) : null}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Requires Finance to verify before this section can be marked complete.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="actionNeutral" loading={saving} disabled={isBank && (!form.payment_institution_id || !form.bank_account_name.trim() || !form.bank_account_number.trim())} onClick={() => void save()}>
            Save & request verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs">
      <input type="checkbox" className="h-3.5 w-3.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function PayrollProfileDialog({ workspace, caseId, onClose, onSaved }: { workspace: Row; caseId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const profile = asRow(asRow(workspace.sections).payroll_profile);
  const [form, setForm] = useState({
    basic_salary: text(profile.basic_salary, "0"),
    currency: text(profile.currency, "MVR"),
    payment_method: text(profile.payment_method, "CASH"),
    payroll_included: profile.payroll_included !== 0 && profile.payroll_included !== false,
    overtime_eligible: Boolean(profile.overtime_eligible),
    benefits_eligible: Boolean(profile.benefits_eligible),
    advance_eligible: Boolean(profile.advance_eligible)
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateOnboardingWorkspacePayrollProfile(token, caseId, { ...form, basic_salary: Number(form.basic_salary) || 0 });
      alerts.showSuccess("Payroll profile saved");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save payroll profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Payroll profile</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Basic salary</Label><Input type="number" min="0" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label>Payroll payment mode</Label>
              <SelectField value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </SelectField>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CheckboxRow label="Include in payroll runs" checked={form.payroll_included} onChange={(v) => setForm({ ...form, payroll_included: v })} />
            <CheckboxRow label="Overtime eligible" checked={form.overtime_eligible} onChange={(v) => setForm({ ...form, overtime_eligible: v })} />
            <CheckboxRow label="Benefits eligible" checked={form.benefits_eligible} onChange={(v) => setForm({ ...form, benefits_eligible: v })} />
            <CheckboxRow label="Salary advance eligible" checked={form.advance_eligible} onChange={(v) => setForm({ ...form, advance_eligible: v })} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>Save & mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserAccountDialog({ workspace, caseId, onClose, onSaved }: { workspace: Row; caseId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [roles, setRoles] = useState<Role[]>([]);
  const userAccount = asRow(asRow(workspace.sections).user_account);
  const linked = asRow(userAccount.linked_user);
  const employee = asRow(workspace.employee);
  const contacts = asRows(asRow(workspace.sections).contacts);
  const workEmail = text(contacts.find((c) => c.contact_type === "WORK_EMAIL")?.value) || text(asRow(userAccount.employee_email).email);
  const [roleId, setRoleId] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listRoles(token).then((res) => {
      const active = res.roles.filter((r) => r.is_active);
      setRoles(active);
      setRoleId(active[0]?.id ?? "");
    }).catch(() => {});
  }, [token]);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveOnboardingWorkspaceUserAccount(token, caseId, {
        action: "provision_new",
        name: text(employee.display_name ?? employee.full_name),
        email: workEmail,
        username: workEmail.split("@")[0] ?? "",
        self_service_enabled: true,
        role_ids: roleId ? [roleId] : [],
        access_scope_ids: [],
        reset_required: true,
        reason: sendInvite ? "Provisioned from onboarding workspace with immediate invite." : "Provisioned from onboarding workspace."
      });
      alerts.showSuccess("User account created");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create user account.");
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed() {
    if (!token) return;
    setSaving(true);
    try {
      await api.saveOnboardingWorkspaceUserAccount(token, caseId, { action: "complete_existing", reason: "Linked user account reviewed in onboarding workspace." });
      await onSaved();
      onClose();
    } catch (err) {
      alerts.showApiError(err, "Unable to update user account status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>User account provisioning</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          {linked.id ? (
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-700">This case is already linked to a real user account ({text(linked.email)}). Manage roles/scopes from Employee 360.</div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2.5 rounded-md p-2.5" style={{ background: workEmail ? "#EAF3DE" : "#FCEBEB" }}>
                <div>
                  <p className="text-xs font-medium text-slate-950">{workEmail || "No office email on file"}</p>
                  <p className="mt-0.5 text-[10px]" style={{ color: workEmail ? "#27500A" : "#A32D2D" }}>{workEmail ? "Using office email — will be the login for this account" : "Add an office email in Personal information first."}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role *</Label>
                  <SelectField value={roleId} onValueChange={setRoleId}>
                    <option value="">Select role</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Send invite</Label>
                  <SelectField value={sendInvite ? "now" : "later"} onValueChange={(v) => setSendInvite(v === "now")}>
                    <option value="now">Immediately on account creation</option>
                    <option value="later">Don't send yet</option>
                  </SelectField>
                </div>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {linked.id ? (
            <Button size="sm" loading={saving} onClick={() => void markReviewed()}>Mark reviewed</Button>
          ) : (
            <Button size="sm" loading={saving} disabled={!workEmail || !roleId} onClick={() => void submit()}>Create account & mark complete</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetsUniformsDialog({ workspace, caseId, permissions, onClose, onSaved }: { workspace: Row; caseId: string; permissions: Set<string>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const refs = asRow(workspace.refs);
  const available = asRows(refs.available_assets);
  const assigned = asRows(asRow(workspace.sections).asset_assignments).filter((a) => text(a.status) !== "RETURNED");
  const [assetId, setAssetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReturn = permissions.has("assets.return");

  async function assign() {
    if (!token || !assetId) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveOnboardingWorkspaceAssetsUniforms(token, caseId, {
        asset_item_id: assetId,
        issued_date: new Date().toISOString().slice(0, 10),
        expected_return_date: "",
        notes: "",
        not_required: false,
        waived: false,
        reason: ""
      });
      alerts.showSuccess("Item assigned");
      setAssetId("");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to assign item.");
    } finally {
      setSaving(false);
    }
  }

  async function unassign(assignmentId: string) {
    if (!token) return;
    try {
      await api.assetAssignmentAction(token, assignmentId, "return");
      alerts.showSuccess("Item returned");
      await onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to return item.");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Uniform & asset assignment</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
            <div className="space-y-1.5">
              <Label>Item</Label>
              <SelectField value={assetId} onValueChange={setAssetId}>
                <option value="">Select an available item</option>
                {available.map((a) => <option key={text(a.id)} value={text(a.id)}>{text(a.name)} ({text(a.code)})</option>)}
              </SelectField>
            </div>
            <Button size="sm" loading={saving} disabled={!assetId} onClick={() => void assign()}><Plus className="h-3.5 w-3.5" /> Assign</Button>
          </div>
          <p className="mb-2 mt-4 text-[10px] font-medium text-muted-foreground">Assigned so far ({assigned.length})</p>
          <div className="space-y-2">
            {assigned.map((row) => (
              <div key={text(row.id)} className="flex items-center gap-3 rounded-md bg-[#F7F7FB] px-2.5 py-2">
                <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[#E6F1FB]"><Laptop className="h-3.5 w-3.5 text-[#0C447C]" /></div>
                <p className="flex-1 truncate text-xs text-slate-950">{text(row.asset_name)} · {text(row.asset_code)}</p>
                {canReturn ? <button type="button" onClick={() => void unassign(text(row.id))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button> : null}
              </div>
            ))}
            {!assigned.length ? <p className="text-xs text-muted-foreground">No items assigned yet.</p> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
