import { Eye, Pencil, Plus, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckboxField, PageHeader, PageShell, StandardTabs } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { EmployeeNumberSettings, EmployeeStatusSetting } from "../types/employees";

type Tab = "statuses" | "numbering";
type StatusModalState = { mode: "create" | "edit"; status: EmployeeStatusSetting };

export function EmployeeSettingsPage() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("statuses");
  const [statuses, setStatuses] = useState<EmployeeStatusSetting[]>([]);
  const [numbering, setNumbering] = useState<EmployeeNumberSettings | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<StatusModalState | null>(null);
  const [statusActionTarget, setStatusActionTarget] = useState<EmployeeStatusSetting | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.view");
  const canStatus = permissions.has("employees.status.manage");
  const canNumber = permissions.has("employees.numbering.manage");

  async function load() {
    if (!token || !canView) return;
    setError(null);
    try {
      const [statusesResult, numberingResult, previewResult] = await Promise.all([
        api.listEmployeeStatuses(token),
        api.getEmployeeNumberingSettings(token),
        api.previewEmployeeNumber(token)
      ]);
      setStatuses(statusesResult.statuses);
      setNumbering(numberingResult.settings);
      setPreview(previewResult.employee_no);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee settings.");
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  async function statusAction(status: EmployeeStatusSetting) {
    if (!token) return;
    const action = status.is_active ? "disable" : "enable";
    try {
      await api.employeeStatusAction(token, status.id, action);
      setStatusActionTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update employee status.");
    }
  }

  async function saveStatus(input: EmployeeStatusSetting) {
    if (!token) return;
    try {
      if (modal?.mode === "create") {
        await api.createEmployeeStatus(token, input);
      } else {
        await api.updateEmployeeStatusSetting(token, input.id, input);
      }
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save status.");
    }
  }

  async function saveNumbering() {
    if (!token || !numbering) return;
    try {
      const result = await api.updateEmployeeNumberingSettings(token, numbering);
      setNumbering(result.settings);
      setPreview((await api.previewEmployeeNumber(token)).employee_no);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save numbering settings.");
    }
  }

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title="Employee Settings" eyebrow="Settings" description="Configurable statuses and employee numbering foundation." />
        <Panel><EmptyState title="Employee settings unavailable" description="Your account needs employees.view permission." /></Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Employee Settings"
        eyebrow="Settings"
        description="Configurable statuses and employee numbering foundation."
        actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <StandardTabs
        label="Employee settings section tabs"
        active={tab}
        onChange={(key) => setTab(key as Tab)}
        items={[
          { key: "statuses", label: "Employee Statuses" },
          { key: "numbering", label: "Employee Numbering" }
        ]}
      />
      <Panel className="overflow-hidden">
        <div className="p-4">
          {tab === "statuses" ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                {canStatus ? <Button size="sm" onClick={() => setModal({ mode: "create", status: createBlankStatus() })}><Plus className="h-4 w-4" /> Create Status</Button> : null}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Key</TableHead><TableHead>Protected</TableHead><TableHead>Status</TableHead><TableHead>Login</TableHead><TableHead>Payroll</TableHead><TableHead>Roster</TableHead><TableHead>Active lists</TableHead><TableHead>Clearance requirements</TableHead><TableHead>Sort</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {statuses.map((status) => (
                      <TableRow key={status.id}>
                        <TableCell className="font-medium">{status.name}</TableCell>
                        <TableCell className="font-mono text-xs">{status.key}</TableCell>
                        <TableCell>{status.is_protected ? <Badge tone="warning">Protected</Badge> : "-"}</TableCell>
                        <TableCell><Badge tone={status.is_active ? "success" : "neutral"}>{status.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell>{status.can_login ? "Yes" : "No"}</TableCell>
                        <TableCell>{status.include_in_payroll ? "Yes" : "No"}</TableCell>
                        <TableCell>{status.include_in_roster ? "Yes" : "No"}</TableCell>
                        <TableCell>{status.show_in_active_lists ? "Yes" : "No"}</TableCell>
                        <TableCell>{[status.requires_final_settlement && "Settlement", status.requires_document_clearance && "Documents", status.requires_asset_clearance && "Assets"].filter(Boolean).join(", ") || "-"}</TableCell>
                        <TableCell>{status.sort_order}</TableCell>
                        <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="View"><Eye className="h-4 w-4" /></Button>{canStatus ? <Button variant="ghost" size="icon" title="Edit" onClick={() => setModal({ mode: "edit", status })}><Pencil className="h-4 w-4" /></Button> : null}{canStatus ? <Button variant="ghost" size="icon" title={status.is_active ? "Disable" : "Enable"} onClick={() => setStatusActionTarget(status)}>{status.is_active ? <ToggleRight className="h-4 w-4 text-emerald-700" /> : <ToggleLeft className="h-4 w-4" />}</Button> : null}</div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {tab === "numbering" && numbering ? <NumberingForm numbering={numbering} preview={preview} canManage={canNumber} onChange={setNumbering} onSave={() => void saveNumbering()} /> : null}
        </div>
      </Panel>
      {modal ? <StatusModal mode={modal.mode} status={modal.status} onClose={() => setModal(null)} onSave={(input) => void saveStatus(input)} /> : null}
      <ConfirmDialog
        open={Boolean(statusActionTarget)}
        title={`${statusActionTarget?.is_active ? "Disable" : "Enable"} employee status`}
        description={`Are you sure you want to ${statusActionTarget?.is_active ? "disable" : "enable"} ${statusActionTarget?.name ?? "this status"}?`}
        confirmLabel={statusActionTarget?.is_active ? "Disable" : "Enable"}
        tone={statusActionTarget?.is_active ? "danger" : "default"}
        onCancel={() => setStatusActionTarget(null)}
        onConfirm={() => statusActionTarget ? void statusAction(statusActionTarget) : undefined}
      />
    </PageShell>
  );
}

function NumberingForm({ numbering, preview, canManage, onChange, onSave }: { numbering: EmployeeNumberSettings; preview: string; canManage: boolean; onChange: (value: EmployeeNumberSettings) => void; onSave: () => void }) {
  const update = (key: keyof EmployeeNumberSettings, value: string | number | boolean) => onChange({ ...numbering, [key]: value });
  return <div className="grid gap-4 lg:grid-cols-3"><div className="space-y-3 lg:col-span-2"><Field label="Prefix" value={numbering.prefix} disabled={!canManage} onChange={(v) => update("prefix", v)} /><Field label="Separator" value={numbering.separator} disabled={!canManage} onChange={(v) => update("separator", v)} /><Field label="Sequence padding" value={String(numbering.sequence_padding)} disabled={!canManage} onChange={(v) => update("sequence_padding", Number(v))} /><Field label="Next sequence" value={String(numbering.next_sequence)} disabled={!canManage} onChange={(v) => update("next_sequence", Number(v))} /><CheckboxField label="Include year" disabled={!canManage} checked={numbering.include_year} onChange={(checked) => update("include_year", checked)} /><CheckboxField label="Include location code" disabled={!canManage} checked={numbering.include_location_code} onChange={(checked) => update("include_location_code", checked)} /><CheckboxField label="Include department code" disabled={!canManage} checked={numbering.include_department_code} onChange={(checked) => update("include_department_code", checked)} /><CheckboxField label="Allow manual override" disabled={!canManage} checked={numbering.allow_manual_override} onChange={(checked) => update("allow_manual_override", checked)} />{canManage ? <Button size="sm" onClick={onSave}><Save className="h-4 w-4" /> Save numbering</Button> : null}</div><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Preview</p><p className="mt-1 font-mono text-lg font-semibold">{preview}</p><p className="mt-3 text-xs text-muted-foreground">Employee numbers must remain unique. Location and department codes are included when configured and supplied.</p></div></div>;
}

function createBlankStatus(): EmployeeStatusSetting {
  return {
    id: "",
    key: "",
    name: "",
    description: "",
    is_protected: false,
    is_active: true,
    can_login: false,
    include_in_payroll: false,
    include_in_roster: false,
    show_in_active_lists: false,
    requires_exit_date: false,
    requires_exit_reason: false,
    requires_final_settlement: false,
    requires_document_clearance: false,
    requires_asset_clearance: false,
    sort_order: 100,
    created_at: "",
    updated_at: ""
  };
}

function StatusModal({ mode, status, onClose, onSave }: { mode: "create" | "edit"; status: EmployeeStatusSetting; onClose: () => void; onSave: (status: EmployeeStatusSetting) => void }) {
  const [form, setForm] = useState(status);
  const update = (key: keyof EmployeeStatusSetting, value: string | number | boolean | null) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{mode === "create" ? "Create employee status" : "Edit employee status"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><Field label="Key" value={form.key} disabled={mode === "edit"} onChange={(v) => update("key", v)} /><Field label="Name" value={form.name} onChange={(v) => update("name", v)} /><Field label="Description" value={form.description ?? ""} onChange={(v) => update("description", v)} /><Field label="Sort order" value={String(form.sort_order)} onChange={(v) => update("sort_order", Number(v))} />{(["can_login","include_in_payroll","include_in_roster","show_in_active_lists","requires_exit_date","requires_exit_reason","requires_final_settlement","requires_document_clearance","requires_asset_clearance"] as Array<keyof EmployeeStatusSetting>).map((key) => <CheckboxField key={key} label={String(key).replace(/_/g, " ")} checked={Boolean(form[key])} onChange={(checked) => update(key, checked)} />)}</div><div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onSave(form)}>Save</Button></div></div></div>;
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}
