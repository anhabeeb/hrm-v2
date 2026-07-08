import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeavePolicy, LeaveType } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

const DOT_COLORS = ["#AFA9EC", "#F0997B", "#7FB8DE", "#8FCB9E", "#FAC775", "#E895B3"];

function bool(value: unknown) {
  return value === true || value === 1;
}

function policyDescription(policy: LeavePolicy) {
  const parts: string[] = [];
  parts.push(policy.annual_entitlement_days != null ? `${policy.annual_entitlement_days} days/year` : "No fixed entitlement");
  parts.push(policy.allow_carry_forward ? `Carries forward up to ${policy.carry_forward_limit_days ?? "—"} days` : "No carry forward");
  if (policy.requires_document) {
    const after = policy.document_required_after_consecutive_days ?? policy.document_required_after_used_days;
    parts.push(`Document required${after ? ` after ${after} consecutive days` : ""}`);
  }
  return parts.join(" · ");
}

export function LeaveTypesPoliciesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("leave.settings.manage");
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeModal, setTypeModal] = useState<LeaveType | "new" | null>(null);
  const [policyModal, setPolicyModal] = useState<LeavePolicy | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [typesRes, policiesRes, deptRes, posRes, locRes] = await Promise.all([
        api.listLeaveTypes(token),
        api.listLeavePolicies(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setTypes(typesRes.leave_types);
      setPolicies(policiesRes.policies);
      setDepartments(deptRes.departments);
      setPositions(posRes.positions);
      setLocations(locRes.locations);
    } catch (err) {
      alerts.showApiError(err, "Unable to load leave types & policies.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggleType(row: LeaveType) {
    if (!token) return;
    try {
      await api.leaveTypeAction(token, row.id, bool(row.is_active) ? "disable" : "enable");
      alerts.showSuccess("Leave type updated", `${row.name} was ${bool(row.is_active) ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update leave type.");
    }
  }

  async function togglePolicy(row: LeavePolicy) {
    if (!token) return;
    try {
      await api.leavePolicyAction(token, row.id, bool(row.is_active) ? "disable" : "enable");
      alerts.showSuccess("Leave policy updated", `${row.name} was ${bool(row.is_active) ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update leave policy.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-lg font-medium text-slate-950">Types & policies</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Leave type entitlements, carry-forward, and document rules</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Leave types</p>
              {canManage ? <Button size="sm" onClick={() => setTypeModal("new")}><Plus className="h-4 w-4" /> New type</Button> : null}
            </div>
            {loading ? (
              <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
            ) : types.length ? (
              <div className="flex flex-col gap-2">
                {types.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Paid default {bool(row.is_paid_default) ? "Yes" : "No"} · Statutory {bool(row.is_statutory) ? "Yes" : "No"} · Sort {row.sort_order}</p>
                    </div>
                    <Badge tone={bool(row.is_active) ? "success" : "neutral"}>{bool(row.is_active) ? "Active" : "Inactive"}</Badge>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit leave type" onClick={() => setTypeModal(row)}>Edit</RowActionButton>
                        <Button size="sm" variant={bool(row.is_active) ? "danger" : "primary"} onClick={() => void toggleType(row)}>{bool(row.is_active) ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : (
              <Panel><EmptyState title="No leave types configured" description="Create leave types such as Annual Leave or Sick Leave." /></Panel>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">Policies</p>
              {canManage ? <Button size="sm" onClick={() => setPolicyModal("new")} disabled={!types.length}><Plus className="h-4 w-4" /> New policy</Button> : null}
            </div>
            {loading ? (
              <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
            ) : policies.length ? (
              <div className="flex flex-col gap-2">
                {policies.map((policy, i) => (
                  <Panel key={policy.id} className="flex items-center gap-3.5 p-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{policy.name} <span className="font-normal text-muted-foreground">· {policy.leave_type_name}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{policyDescription(policy)}</p>
                    </div>
                    {policy.department_name || policy.location_name ? (
                      <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[9px] text-muted-foreground">{policy.department_name ?? policy.location_name}</span>
                    ) : null}
                    <Badge tone={bool(policy.is_active) ? "success" : "neutral"}>{bool(policy.is_active) ? "Active" : "Inactive"}</Badge>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit policy" onClick={() => setPolicyModal(policy)}>Edit</RowActionButton>
                        <Button size="sm" variant={bool(policy.is_active) ? "danger" : "primary"} onClick={() => void togglePolicy(policy)}>{bool(policy.is_active) ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : (
              <Panel><EmptyState title="No leave policies configured" description="Create a policy for each leave type to set entitlements and rules." /></Panel>
            )}
          </div>
        </div>
      </div>

      {typeModal ? <TypeModal type={typeModal === "new" ? undefined : typeModal} onClose={() => setTypeModal(null)} onSaved={() => { setTypeModal(null); void load(); }} /> : null}
      {policyModal ? (
        <PolicyModal
          policy={policyModal === "new" ? undefined : policyModal}
          types={types}
          departments={departments}
          positions={positions}
          locations={locations}
          onClose={() => setPolicyModal(null)}
          onSaved={() => { setPolicyModal(null); void load(); }}
        />
      ) : null}
    </PageShell>
  );
}

function TypeModal({ type, onClose, onSaved }: { type?: LeaveType; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    code: type?.code ?? "",
    name: type?.name ?? "",
    description: type?.description ?? "",
    is_paid_default: bool(type?.is_paid_default ?? true),
    is_statutory: bool(type?.is_statutory ?? false),
    sort_order: String(type?.sort_order ?? 100)
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = { ...form, sort_order: Number(form.sort_order) || 100 };
      if (type) await api.updateLeaveType(token, type.id, input);
      else await api.createLeaveType(token, input);
      alerts.showSuccess("Leave type saved", "The leave type was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save leave type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{type ? "Edit leave type" : "Create leave type"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="flex items-end gap-4">
              <CheckboxField label="Paid default" checked={form.is_paid_default} onChange={(v) => setForm({ ...form, is_paid_default: v })} />
              <CheckboxField label="Statutory" checked={form.is_statutory} onChange={(v) => setForm({ ...form, is_statutory: v })} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyModal({
  policy,
  types,
  departments,
  positions,
  locations,
  onClose,
  onSaved
}: {
  policy?: LeavePolicy;
  types: LeaveType[];
  departments: OrganizationDepartment[];
  positions: OrganizationPosition[];
  locations: OrganizationLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    leave_type_id: policy?.leave_type_id ?? types[0]?.id ?? "",
    name: policy?.name ?? "",
    applies_to_employee_type: policy?.applies_to_employee_type ?? "",
    applies_to_employment_type: policy?.applies_to_employment_type ?? "",
    department_id: policy?.department_id ?? "",
    position_id: policy?.position_id ?? "",
    location_id: policy?.location_id ?? "",
    annual_entitlement_days: String(policy?.annual_entitlement_days ?? ""),
    allow_half_day: bool(policy?.allow_half_day ?? true),
    allow_carry_forward: bool(policy?.allow_carry_forward),
    carry_forward_limit_days: String(policy?.carry_forward_limit_days ?? ""),
    carry_forward_expiry_month: String(policy?.carry_forward_expiry_month ?? ""),
    include_public_holidays: bool(policy?.include_public_holidays),
    include_weekly_off_days: bool(policy?.include_weekly_off_days),
    salary_deduction_mode: policy?.salary_deduction_mode ?? "NONE",
    deduction_pay_component: policy?.deduction_pay_component ?? "",
    requires_document: bool(policy?.requires_document),
    document_required_after_consecutive_days: String(policy?.document_required_after_consecutive_days ?? ""),
    document_required_after_used_days: String(policy?.document_required_after_used_days ?? ""),
    max_consecutive_days: String(policy?.max_consecutive_days ?? ""),
    min_notice_days: String(policy?.min_notice_days ?? ""),
    long_leave_threshold_days: String(policy?.long_leave_threshold_days ?? ""),
    priority: String(policy?.priority ?? 100)
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
      if (policy) await api.updateLeavePolicy(token, policy.id, input);
      else await api.createLeavePolicy(token, input);
      alerts.showSuccess("Leave policy saved", "The leave policy was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save leave policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{policy ? "Edit leave policy" : "Create leave policy"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Leave type</Label><SelectField value={form.leave_type_id} onValueChange={(v) => update("leave_type_id", v)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Policy name</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Employee type</Label><SelectField value={form.applies_to_employee_type} onValueChange={(v) => update("applies_to_employee_type", v)}><option value="">Any</option><option value="LOCAL">Local</option><option value="FOREIGN">Foreign</option><option value="OTHER">Other</option></SelectField></div>
            <div className="space-y-1.5"><Label>Employment type</Label><SelectField value={form.applies_to_employment_type} onValueChange={(v) => update("applies_to_employment_type", v)}><option value="">Any</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="INTERN">Intern</option><option value="TEMPORARY">Temporary</option><option value="CONTRACT">Contract</option></SelectField></div>
            <div className="md:col-span-3">
              <OrganizationCascadeSelector
                value={{ locationId: form.location_id, departmentId: form.department_id, positionId: form.position_id }}
                onChange={(next) => setForm((current) => ({ ...current, location_id: next.locationId ?? "", department_id: next.departmentId ?? "", position_id: next.positionId ?? "" }))}
                departments={departments}
                locations={locations}
                jobLevels={[]}
                positions={positions}
                includeLocation
                includeJobLevel={false}
                requireJobLevelForPosition={false}
                mode="approval-routing"
                labels={{ locationId: "Location", departmentId: "Department", positionId: "Position" }}
                className="grid gap-3 md:grid-cols-3"
                allowEmpty
              />
            </div>
            <div className="space-y-1.5"><Label>Annual entitlement (days)</Label><Input type="number" value={form.annual_entitlement_days} onChange={(e) => update("annual_entitlement_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Deduction mode</Label><SelectField value={form.salary_deduction_mode} onValueChange={(v) => update("salary_deduction_mode", v as typeof form.salary_deduction_mode)}><option value="NONE">None</option><option value="FULL_DAY">Full day</option><option value="WORKED_DAYS_ONLY">Worked days only</option><option value="CUSTOM">Custom</option></SelectField></div>
            <div className="space-y-1.5"><Label>Deduction pay component</Label><Input value={form.deduction_pay_component} onChange={(e) => update("deduction_pay_component", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Doc after consecutive days</Label><Input type="number" value={form.document_required_after_consecutive_days} onChange={(e) => update("document_required_after_consecutive_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Doc after used days</Label><Input type="number" value={form.document_required_after_used_days} onChange={(e) => update("document_required_after_used_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Max consecutive days</Label><Input type="number" value={form.max_consecutive_days} onChange={(e) => update("max_consecutive_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Min notice days</Label><Input type="number" value={form.min_notice_days} onChange={(e) => update("min_notice_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Long leave threshold</Label><Input type="number" value={form.long_leave_threshold_days} onChange={(e) => update("long_leave_threshold_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Carry forward limit (days)</Label><Input type="number" value={form.carry_forward_limit_days} onChange={(e) => update("carry_forward_limit_days", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Carry forward expiry month</Label><Input type="number" min={1} max={12} value={form.carry_forward_expiry_month} onChange={(e) => update("carry_forward_expiry_month", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => update("priority", e.target.value)} /></div>
            <div className="flex flex-wrap items-end gap-4 md:col-span-3">
              <CheckboxField label="Allow half day" checked={form.allow_half_day} onChange={(v) => update("allow_half_day", v)} />
              <CheckboxField label="Allow carry forward" checked={form.allow_carry_forward} onChange={(v) => update("allow_carry_forward", v)} />
              <CheckboxField label="Include public holidays" checked={form.include_public_holidays} onChange={(v) => update("include_public_holidays", v)} />
              <CheckboxField label="Include weekly off days" checked={form.include_weekly_off_days} onChange={(v) => update("include_weekly_off_days", v)} />
              <CheckboxField label="Requires document" checked={form.requires_document} onChange={(v) => update("requires_document", v)} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
