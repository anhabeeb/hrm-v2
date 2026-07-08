import { useEffect, useState } from "react";
import { FileText, Lock, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { ApiError, api } from "../../lib/api";

function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (`${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`).toUpperCase() || "E";
}
function tenureOf(joiningDate: string) {
  if (!joiningDate) return "";
  const start = new Date(joiningDate);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return `${years} yr${years !== 1 ? "s" : ""} ${remMonths} mo of service`;
}

type FieldOption = { fieldKey: string; label: string; current: string };

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-slate-950">{text(value)}</p>
    </div>
  );
}

export function SelfServiceProfilePage() {
  const { token } = useAuth();
  const [employee, setEmployee] = useState<Row | null>(null);
  const [contacts, setContacts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestSection, setRequestSection] = useState<{ section: string; options: FieldOption[] } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getSelfServiceProfile(token);
      setEmployee(result.employee as Row | null);
      setContacts(asRows(result.contacts));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div></PageShell>;
  if (error || !employee) return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Unable to load profile" description={error ?? "No employee profile is linked to your account."} /></Panel></PageShell>;

  const name = text(employee.full_name, "Employee");
  const workEmail = text(contacts.find((c) => c.contact_type === "WORK_EMAIL")?.value, "");
  const personalEmail = text(contacts.find((c) => c.contact_type === "PERSONAL_EMAIL")?.value, "");
  const phone = text(contacts.find((c) => c.contact_type === "PERSONAL_PHONE")?.value, "");
  const emergencyContacts = contacts
    .filter((c) => ["EMERGENCY", "GUARDIAN", "SPOUSE", "PARENT", "OTHER"].includes(String(c.contact_type)))
    .sort((a, b) => (Number(b.is_primary ?? 0) - Number(a.is_primary ?? 0)) || (Number(a.emergency_priority ?? 99) - Number(b.emergency_priority ?? 99)));

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <Panel className="flex items-center gap-4 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#E6F1FB] text-lg font-medium text-[#0C447C]">{initialsOf(name)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-950">{name}</p>
              <Badge tone="success">{text(employee.status_name, "Active")}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{[text(employee.position_title), text(employee.department_name), text(employee.employee_no)].filter((v) => v !== "—").join(" · ")}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{[employee.joining_date ? `Joined ${text(employee.joining_date)}` : "", tenureOf(text(employee.joining_date, "")), text(employee.location_name)].filter(Boolean).join(" · ")}</p>
          </div>
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Personal details</p>
              <button type="button" className="flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-1 text-[10px] font-medium text-[#854F0B]" onClick={() => setRequestSection({ section: "personal", options: [
                { fieldKey: "display_name", label: "Full name", current: text(employee.display_name ?? employee.full_name, "") },
                { fieldKey: "date_of_birth", label: "Date of birth", current: text(employee.date_of_birth, "") },
                { fieldKey: "gender", label: "Gender", current: text(employee.gender, "") },
                { fieldKey: "nationality", label: "Nationality", current: text(employee.nationality, "") }
              ] })}>
                <Lock className="h-2.5 w-2.5" /> Request to change
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" value={employee.display_name ?? employee.full_name} />
              <Field label="Date of birth" value={employee.date_of_birth} />
              <Field label="Gender" value={employee.gender} />
              <Field label="Nationality" value={employee.nationality} />
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Contact information</p>
              <button type="button" className="flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-1 text-[10px] font-medium text-[#854F0B]" onClick={() => setRequestSection({ section: "contact", options: [
                { fieldKey: "personal_email", label: "Personal email", current: personalEmail },
                { fieldKey: "personal_phone", label: "Phone number", current: phone }
              ] })}>
                <Lock className="h-2.5 w-2.5" /> Request to change
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Personal email" value={personalEmail} />
              <div>
                <p className="text-[9px] text-muted-foreground">Work email</p>
                <p className="mt-0.5 text-xs text-slate-950">{text(workEmail)}</p>
                <p className="mt-0.5 text-[8px] text-muted-foreground"><Lock className="mr-0.5 inline h-2 w-2" />Used for login · HR-managed</p>
              </div>
              <Field label="Phone number" value={phone} />
            </div>
          </Panel>
        </div>

        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-950">Emergency contacts</p>
            <button type="button" className="flex items-center gap-1 rounded-md bg-[#EEEDFE] px-2 py-1 text-[10px] font-medium text-primary" onClick={() => setRequestSection({ section: "emergency", options: [
              { fieldKey: "emergency_contact", label: "Add emergency contact (name, relationship, phone)", current: "" }
            ] })}>
              <Plus className="h-2.5 w-2.5" /> Add contact
            </button>
          </div>
          {emergencyContacts.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {emergencyContacts.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-[#F7F7FB] px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-slate-950">{text(c.value)}</p>
                    <p className="text-[9px] text-muted-foreground">{text(c.relationship)}</p>
                  </div>
                  {c.is_primary ? <Badge tone="categoryPinkViolet">Primary</Badge> : null}
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No emergency contacts on file.</p>}
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <p className="mb-3 text-xs font-medium text-slate-950">Employment details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position" value={employee.position_title} />
              <Field label="Department" value={employee.department_name} />
              <Field label="Reporting manager" value={employee.reporting_manager_name} />
              <Field label="Employment type" value={employee.employment_type} />
            </div>
            <p className="mt-3 text-[9px] text-muted-foreground">Managed by HR — not employee-editable</p>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Bank & payroll</p>
              <button type="button" className="flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-1 text-[10px] font-medium text-[#854F0B]" onClick={() => setRequestSection({ section: "other", options: [
                { fieldKey: "bank_account", label: "Bank / account details", current: "" }
              ] })}>
                <Lock className="h-2.5 w-2.5" /> Request to change
              </button>
            </div>
            <p className="text-xs text-muted-foreground">View and manage payment methods from My payroll.</p>
            <Link to="/v3-preview/self-service/payroll" className="mt-2 inline-block text-[10px] text-primary">Go to My payroll →</Link>
          </Panel>
        </div>

        <Panel className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-[#E6F1FB]"><FileText className="h-3.5 w-3.5 text-[#0C447C]" /></div>
            <p className="text-xs font-medium text-slate-950">Documents on file</p>
          </div>
          <Link to="/v3-preview/self-service/documents" className="text-[10px] text-primary">Go to My documents →</Link>
        </Panel>
      </div>

      {requestSection ? (
        <RequestChangeDialog section={requestSection} onClose={() => setRequestSection(null)} onSaved={load} />
      ) : null}
    </PageShell>
  );
}

function RequestChangeDialog({ section, onClose, onSaved }: { section: { section: string; options: FieldOption[] }; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [fieldIndex, setFieldIndex] = useState(0);
  const field = section.options[fieldIndex];
  const [value, setValue] = useState(field.current);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectField(index: number) {
    setFieldIndex(index);
    setValue(section.options[index].current);
  }

  async function submit() {
    if (!token || !value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createSelfServiceProfileUpdateRequest(token, { section: section.section, field_key: field.fieldKey, requested_value: value.trim(), reason: reason.trim() || null });
      alerts.showSuccess("Request submitted", "HR will review your change request.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{section.options.length > 1 ? "Request a profile change" : field.label}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            {section.options.length > 1 ? (
              <div className="space-y-1.5">
                <Label>Field *</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/20"
                  value={fieldIndex}
                  onChange={(e) => selectField(Number(e.target.value))}
                >
                  {section.options.map((opt, i) => <option key={opt.fieldKey} value={i}>{opt.label}</option>)}
                </select>
              </div>
            ) : null}
            <div className="space-y-1.5"><Label>New value *</Label><Input value={value} onChange={(e) => setValue(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you requesting this change?" /></div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">This submits a request for HR to review — it won't change immediately.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!value.trim()} onClick={() => void submit()}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
