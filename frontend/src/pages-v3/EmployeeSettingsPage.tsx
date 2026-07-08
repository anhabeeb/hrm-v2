import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, CheckboxField, type StandardTabItem } from "../components/ui/page-shell";
import { NavRail } from "../components/ui/nav-rail";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { EmployeeNumberSettings, EmployeeStatusSetting } from "../types/employees";

const TAB_ITEMS: StandardTabItem[] = [
  { key: "statuses", label: "Employee statuses" },
  { key: "numbering", label: "Employee numbering" }
];

function createBlankStatus(): EmployeeStatusSetting {
  return {
    id: "", key: "", name: "", description: "", is_protected: false, is_active: true, can_login: false,
    include_in_payroll: false, include_in_roster: false, show_in_active_lists: false, requires_exit_date: false,
    requires_exit_reason: false, requires_final_settlement: false, requires_document_clearance: false,
    requires_asset_clearance: false, sort_order: 100, created_at: "", updated_at: ""
  };
}

export function EmployeeSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [tab, setTab] = useState("statuses");
  const [statuses, setStatuses] = useState<EmployeeStatusSetting[]>([]);
  const [numbering, setNumbering] = useState<EmployeeNumberSettings | null>(null);
  const [preview, setPreview] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; status: EmployeeStatusSetting } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canStatus = permissions.has("employees.status.manage");
  const canNumber = permissions.has("employees.numbering.manage");

  async function load() {
    if (!token) return;
    const [statusesResult, numberingResult, previewResult] = await Promise.all([
      api.listEmployeeStatuses(token),
      api.getEmployeeNumberingSettings(token),
      api.previewEmployeeNumber(token)
    ]);
    setStatuses(statusesResult.statuses);
    setNumbering(numberingResult.settings);
    setPreview(previewResult.employee_no);
  }

  useEffect(() => { void load(); }, [token]);

  async function toggleStatus(status: EmployeeStatusSetting) {
    if (!token) return;
    try {
      await api.employeeStatusAction(token, status.id, status.is_active ? "disable" : "enable");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update employee status.");
    }
  }

  async function saveStatus(input: EmployeeStatusSetting) {
    if (!token) return;
    try {
      if (modal?.mode === "create") await api.createEmployeeStatus(token, input);
      else await api.updateEmployeeStatusSetting(token, input.id, input);
      alerts.showSuccess("Status saved", "Employee status was saved.");
      setModal(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save status.");
    }
  }

  async function saveNumbering() {
    if (!token || !numbering) return;
    try {
      const result = await api.updateEmployeeNumberingSettings(token, numbering);
      setNumbering(result.settings);
      setPreview((await api.previewEmployeeNumber(token)).employee_no);
      alerts.showSuccess("Numbering saved", "Employee numbering settings were saved.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save numbering settings.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <NavRail items={TAB_ITEMS} active={tab} onChange={setTab} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          {tab === "statuses" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium text-slate-950">Employee statuses</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Configure lifecycle statuses and their downstream effects</p>
                </div>
                {canStatus ? <Button size="sm" onClick={() => setModal({ mode: "create", status: createBlankStatus() })}><Plus className="h-4 w-4" /> Create status</Button> : null}
              </div>
              <div className="flex flex-col gap-2">
                {statuses.map((status) => {
                  const clearance = [status.requires_final_settlement && "Settlement", status.requires_document_clearance && "Documents", status.requires_asset_clearance && "Assets"].filter(Boolean).join(", ");
                  return (
                    <Panel key={status.id} className="flex items-center gap-3.5 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{status.name} <span className="font-mono text-[10px] text-muted-foreground">{status.key}</span>{status.is_protected ? <span className="ml-1.5 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[9px] font-medium text-[#854F0B]">Protected</span> : null}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Login {status.can_login ? "yes" : "no"} · Payroll {status.include_in_payroll ? "yes" : "no"} · Roster {status.include_in_roster ? "yes" : "no"} · Active lists {status.show_in_active_lists ? "yes" : "no"} · Sort {status.sort_order}{clearance ? ` · Requires ${clearance}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: status.is_active ? "#EAF3DE" : "#F7F7FB", color: status.is_active ? "#27500A" : "#6B6F86" }}>{status.is_active ? "Active" : "Inactive"}</span>
                      {canStatus ? (
                        <div className="flex shrink-0 gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setModal({ mode: "edit", status })}>Edit</Button>
                          <Button size="sm" variant={status.is_active ? "danger" : "primary"} onClick={() => void toggleStatus(status)}>{status.is_active ? "Disable" : "Enable"}</Button>
                        </div>
                      ) : null}
                    </Panel>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === "numbering" && numbering ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <p className="text-lg font-medium text-slate-950">Employee numbering</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Format used to auto-generate new employee numbers</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Prefix</Label><Input disabled={!canNumber} value={numbering.prefix} onChange={(e) => setNumbering({ ...numbering, prefix: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Separator</Label><Input disabled={!canNumber} value={numbering.separator} onChange={(e) => setNumbering({ ...numbering, separator: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Sequence padding</Label><Input type="number" disabled={!canNumber} value={numbering.sequence_padding} onChange={(e) => setNumbering({ ...numbering, sequence_padding: Number(e.target.value) })} /></div>
                  <div className="space-y-1.5"><Label>Next sequence</Label><Input type="number" disabled={!canNumber} value={numbering.next_sequence} onChange={(e) => setNumbering({ ...numbering, next_sequence: Number(e.target.value) })} /></div>
                </div>
                <div className="flex flex-col gap-2">
                  <CheckboxField label="Include year" disabled={!canNumber} checked={numbering.include_year} onChange={(checked) => setNumbering({ ...numbering, include_year: checked })} />
                  <CheckboxField label="Include location code" disabled={!canNumber} checked={numbering.include_location_code} onChange={(checked) => setNumbering({ ...numbering, include_location_code: checked })} />
                  <CheckboxField label="Include department code" disabled={!canNumber} checked={numbering.include_department_code} onChange={(checked) => setNumbering({ ...numbering, include_department_code: checked })} />
                  <CheckboxField label="Allow manual override" disabled={!canNumber} checked={numbering.allow_manual_override} onChange={(checked) => setNumbering({ ...numbering, allow_manual_override: checked })} />
                </div>
                {canNumber ? <Button size="sm" onClick={() => void saveNumbering()}>Save numbering</Button> : null}
              </div>
              <Panel className="p-3">
                <p className="text-[10px] text-muted-foreground">Preview</p>
                <p className="mt-1 font-mono text-lg font-medium text-slate-950">{preview}</p>
                <p className="mt-3 text-[10px] text-muted-foreground">Employee numbers must remain unique. Location and department codes are included when configured and supplied.</p>
              </Panel>
            </div>
          ) : null}
        </div>
      </div>

      {modal ? <StatusModal mode={modal.mode} status={modal.status} onClose={() => setModal(null)} onSave={(input) => void saveStatus(input)} /> : null}
    </PageShell>
  );
}

function StatusModal({ mode, status, onClose, onSave }: { mode: "create" | "edit"; status: EmployeeStatusSetting; onClose: () => void; onSave: (status: EmployeeStatusSetting) => void }) {
  const [form, setForm] = useState(status);
  const flags: Array<keyof EmployeeStatusSetting> = ["can_login", "include_in_payroll", "include_in_roster", "show_in_active_lists", "requires_exit_date", "requires_exit_reason", "requires_final_settlement", "requires_document_clearance", "requires_asset_clearance"];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{mode === "create" ? "Create employee status" : "Edit employee status"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Key</Label><Input disabled={mode === "edit"} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {flags.map((key) => <CheckboxField key={key} label={String(key).replace(/_/g, " ")} checked={Boolean(form[key])} onChange={(checked) => setForm({ ...form, [key]: checked })} />)}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
