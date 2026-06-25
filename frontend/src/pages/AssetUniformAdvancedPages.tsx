import { FilePlus, RefreshCw, Shirt, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AssetsNav } from "../components/assets/AssetsNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetUniformSettings, UniformAssignment, UniformStockItem, UniformType } from "../types/assets";
import type { Employee } from "../types/employees";
import type { OrganizationLocation } from "../types/organization";

type ModalState =
  | { type: "type"; row?: UniformType }
  | { type: "stock"; row?: UniformStockItem }
  | { type: "issue" }
  | { type: "action"; row: UniformAssignment; action: "return" | "mark-damaged" | "mark-lost" | "apply-deduction" | "waive" }
  | null;

const uniformTypeCategories = ["SHIRT", "TROUSER", "APRON", "CAP", "SHOES", "NAME_BADGE", "OTHER"];
const assignmentStatuses = ["ISSUED", "RETURNED", "PARTIALLY_RETURNED", "DAMAGED", "LOST", "DEDUCTION_PENDING", "DEDUCTION_APPLIED", "WAIVED", "CANCELLED"];

function tone(status?: string) {
  if (["ACTIVE", "ISSUED", "RETURNED", "CLEARED"].includes(status ?? "")) return "success" as const;
  if (["DAMAGED", "DEDUCTION_PENDING", "PARTIALLY_RETURNED"].includes(status ?? "")) return "warning" as const;
  if (["LOST", "CANCELLED", "ARCHIVED", "INACTIVE"].includes(status ?? "")) return "danger" as const;
  return "neutral" as const;
}

function isOn(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export function AssetUniformSettingsPage() {
  const { token, user } = useAuth();
  const canManage = Boolean(user?.permissions.includes("assets.settings.manage") || user?.permissions.includes("uniforms.settings.manage"));
  const [settings, setSettings] = useState<Partial<AssetUniformSettings> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const result = await api.getAssetUniformSettings(token);
      setSettings(result.settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset and uniform settings.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function save() {
    if (!token || !settings) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api.updateAssetUniformSettings(token, settings);
      setSettings(result.settings);
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save settings.");
    }
  }

  const checks: Array<[keyof AssetUniformSettings, string, string]> = [
    ["asset_module_enabled", "Asset module enabled", "Allows asset item issue, return, damage, lost, deduction, and clearance actions."],
    ["uniform_module_enabled", "Uniform module enabled", "Allows uniform type, stock, issue, return, damage, lost, and clearance actions."],
    ["require_approval_before_asset_issue", "Approval before asset issue", "Creates central approval foundation records before asset issue when workflows are enabled."],
    ["require_approval_before_damage_loss_deduction", "Approval before damage/loss deduction", "Routes damage and lost item deduction decisions through approvals."],
    ["allow_payroll_deduction_for_lost_damaged_items", "Allow payroll deduction", "Allows asset/uniform recovery to create custom payroll deductions."],
    ["allow_final_settlement_deduction", "Allow final settlement deduction", "Includes pending asset/uniform recovery in exit payroll clearance."],
    ["default_asset_clearance_required_before_final_settlement", "Asset clearance before final settlement", "Requires asset clearance during employee exit processing."],
    ["default_uniform_clearance_required_before_final_settlement", "Uniform clearance before final settlement", "Requires uniform clearance during employee exit processing."],
    ["allow_employee_self_service_asset_view", "Self-service asset view", "Employees can view their own asset history."],
    ["allow_employee_self_service_uniform_view", "Self-service uniform view", "Employees can view their own uniform history."],
    ["require_reason_for_waiver", "Reason required for waiver", "Waiving recovery requires a reason."],
    ["require_reason_for_deduction", "Reason required for deduction", "Deduction creation requires a reason."],
    ["require_reason_for_cancel", "Reason required for cancel", "Cancellation requires a reason."],
    ["use_central_approval_workflow", "Use central approval workflow", "Uses Prompt 16 approval workflow foundation where matched."]
  ];

  return (
    <div className="space-y-4">
      <Header title="Asset & Uniform Settings" description="Configure lifecycle, clearance, deduction, final settlement, self-service, and approval foundations." action={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
      <Panel className="p-0"><AssetsNav /></Panel>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <Panel className="p-4">
        {!settings ? <EmptyState title="No settings loaded" description="Settings will appear after loading." /> : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {checks.map(([key, label, description]) => (
                <label key={key} className="flex gap-3 rounded-md border p-3">
                  <input type="checkbox" checked={isOn(settings[key])} disabled={!canManage} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Default damage deduction mode">
                <Select value={String(settings.default_damage_deduction_mode ?? "FULL_REPLACEMENT_VALUE")} disabled={!canManage} onChange={(value) => setSettings({ ...settings, default_damage_deduction_mode: value })}>
                  {["FULL_REPLACEMENT_VALUE", "CURRENT_VALUE", "MANUAL_AMOUNT", "CUSTOM_FORMULA_PLACEHOLDER"].map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
              </Field>
              <Field label="Default uniform replacement cycle months">
                <Input type="number" value={String(settings.default_uniform_replacement_cycle_months ?? "")} disabled={!canManage} onChange={(event) => setSettings({ ...settings, default_uniform_replacement_cycle_months: event.target.value ? Number(event.target.value) : null })} />
              </Field>
              <div className="flex items-end">{canManage ? <Button size="sm" onClick={() => void save()}><SlidersHorizontal className="h-4 w-4" /> Save settings</Button> : <Badge tone="warning">Read only</Badge>}</div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function UniformTypesPage() {
  const { token, user } = useAuth();
  const canManage = Boolean(user?.permissions.includes("uniforms.types.manage") || user?.permissions.includes("uniforms.manage") || user?.permissions.includes("assets.settings.manage"));
  const [rows, setRows] = useState<UniformType[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      setRows((await api.listUniformTypes(token)).types ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load uniform types.");
    }
  }

  useEffect(() => { void load(); }, [token]);
  const filtered = rows.filter((row) => !query || `${row.code} ${row.name} ${row.category}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <Header title="Uniform Types" description="Manage uniform templates, clearance defaults, replacement cycle, and deduction defaults." action={canManage ? <Button size="sm" onClick={() => setModal({ type: "type" })}>Create type</Button> : null} />
      <Panel className="p-0"><AssetsNav /><div className="flex gap-2 p-4"><Input className="max-w-xs" placeholder="Search code/name/category" value={query} onChange={(event) => setQuery(event.target.value)} /><Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button></div></Panel>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Panel className="overflow-hidden p-0"><TableWrap><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Cycle</TableHead><TableHead>Clearance</TableHead><TableHead>Deduction</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.category}</TableCell><TableCell>{row.default_replacement_cycle_months ?? "-"}</TableCell><TableCell>{isOn(row.default_clearance_required) ? "Required" : "Not required"}</TableCell><TableCell>{row.default_deduction_amount ?? "-"}</TableCell><TableCell><Badge tone={tone(row.status)}>{row.status}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" disabled={!canManage} onClick={() => setModal({ type: "type", row })}>Edit</Button><Button variant="ghost" size="sm" disabled={!canManage} onClick={() => { if (token) void api.archiveUniformType(token, row.id).then(load); }}>Archive</Button></TableCell></TableRow>)}</TableBody></Table>{!filtered.length ? <EmptyState title="No uniform types" description="Create uniform types such as shirts, shoes, aprons, and name badges." /> : null}</TableWrap></Panel>
      {modal?.type === "type" ? <UniformTypeModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </div>
  );
}

export function UniformInventoryPage() {
  const { token, user } = useAuth();
  const canManage = Boolean(user?.permissions.includes("uniforms.stock.manage") || user?.permissions.includes("uniforms.manage"));
  const [stock, setStock] = useState<UniformStockItem[]>([]);
  const [types, setTypes] = useState<UniformType[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState({ search: "", uniform_type_id: "", location_id: "", status: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const [stockRows, typeRows, locationRows] = await Promise.all([
        api.listUniformStock(token, filters),
        api.listUniformTypes(token),
        api.listLocations(token)
      ]);
      setStock(stockRows.stock ?? []);
      setTypes(typeRows.types ?? []);
      setLocations(locationRows.locations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load uniform stock.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <div className="space-y-4">
      <Header title="Uniform Inventory" description="Track uniform quantities by type, size, and location." action={canManage ? <Button size="sm" onClick={() => setModal({ type: "stock" })}>Create stock</Button> : null} />
      <Panel className="p-0"><AssetsNav /><div className="grid gap-2 p-4 md:grid-cols-5"><Input placeholder="Search type/size" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><Select value={filters.uniform_type_id} onChange={(value) => setFilters({ ...filters, uniform_type_id: value })}><option value="">All types</option>{types.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select value={filters.location_id} onChange={(value) => setFilters({ ...filters, location_id: value })}><option value="">All locations</option>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })}><option value="">All status</option>{["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => <option key={value} value={value}>{value}</option>)}</Select><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button></div></Panel>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Panel className="overflow-hidden p-0"><TableWrap><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Size</TableHead><TableHead>Location</TableHead><TableHead>Total</TableHead><TableHead>Available</TableHead><TableHead>Issued</TableHead><TableHead>Damaged/Lost</TableHead><TableHead>Reorder</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{stock.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.uniform_type_name}</div><div className="text-xs text-muted-foreground">{row.uniform_type_code}</div></TableCell><TableCell>{row.size_label ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{row.total_quantity}</TableCell><TableCell>{row.available_quantity}</TableCell><TableCell>{row.issued_quantity}</TableCell><TableCell>{row.damaged_quantity} / {row.lost_quantity}</TableCell><TableCell>{row.reorder_level ?? "-"}</TableCell><TableCell><Badge tone={tone(row.status)}>{row.status}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" disabled={!canManage} onClick={() => setModal({ type: "stock", row })}>Edit</Button></TableCell></TableRow>)}</TableBody></Table>{!stock.length ? <EmptyState title="No uniform stock" description="Add stock quantities by type, size, and location." /> : null}</TableWrap></Panel>
      {modal?.type === "stock" ? <UniformStockModal row={modal.row} types={types} locations={locations} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </div>
  );
}

export function UniformAssignmentsPage() {
  const { token, user } = useAuth();
  const canIssue = Boolean(user?.permissions.includes("uniforms.issue") || user?.permissions.includes("assets.issue"));
  const canReturn = Boolean(user?.permissions.includes("uniforms.return") || user?.permissions.includes("assets.return"));
  const canDamage = Boolean(user?.permissions.includes("uniforms.damage") || user?.permissions.includes("assets.damage"));
  const canLost = Boolean(user?.permissions.includes("uniforms.lost") || user?.permissions.includes("assets.lost"));
  const canDeduct = Boolean(user?.permissions.includes("uniforms.deductions.apply") || user?.permissions.includes("assets.deductions.manage"));
  const [rows, setRows] = useState<UniformAssignment[]>([]);
  const [stock, setStock] = useState<UniformStockItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", location_id: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const [assignmentRows, stockRows, employeeRows, locationRows] = await Promise.all([
        api.listUniformAssignments(token, filters),
        api.listUniformStock(token, { status: "ACTIVE" }),
        api.listEmployees(token),
        api.listLocations(token)
      ]);
      setRows(assignmentRows.assignments ?? []);
      setStock(stockRows.stock ?? []);
      setEmployees(employeeRows.employees ?? []);
      setLocations(locationRows.locations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load uniform assignments.");
    }
  }

  useEffect(() => { void load(); }, [token]);
  const availableStock = stock.filter((row) => row.available_quantity > 0);

  return (
    <div className="space-y-4">
      <Header title="Uniform Assignments" description="Issue, return, damage/lost, waive, and payroll recovery foundation for uniforms." action={canIssue ? <Button size="sm" onClick={() => setModal({ type: "issue" })}><Shirt className="h-4 w-4" /> Issue uniform</Button> : null} />
      <Panel className="p-0"><AssetsNav /><div className="grid gap-2 p-4 md:grid-cols-4"><Input placeholder="Employee or uniform" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><Select value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })}><option value="">All status</option>{assignmentStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</Select><Select value={filters.location_id} onChange={(value) => setFilters({ ...filters, location_id: value })}><option value="">All locations</option>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button></div></Panel>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Panel className="overflow-hidden p-0"><TableWrap><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Uniform</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Clearance</TableHead><TableHead>Issued</TableHead><TableHead>Expected return</TableHead><TableHead>Deduction</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><Link className="font-medium text-primary" to={`/employees/${row.employee_id}`}>{row.employee_name ?? row.employee_no ?? row.employee_id}</Link><div className="text-xs text-muted-foreground">{row.department_name ?? "-"} / {row.location_name ?? "-"}</div></TableCell><TableCell><div>{row.uniform_type_name}</div><div className="text-xs text-muted-foreground">{row.uniform_type_code} / {row.size_label ?? "-"}</div></TableCell><TableCell>{row.quantity_issued} issued<br /><span className="text-xs text-muted-foreground">{row.quantity_returned} returned, {row.quantity_damaged} damaged, {row.quantity_lost} lost</span></TableCell><TableCell><Badge tone={tone(row.assignment_status)}>{row.assignment_status}</Badge></TableCell><TableCell><Badge tone={tone(row.clearance_status)}>{row.clearance_status}</Badge></TableCell><TableCell>{row.issued_date}</TableCell><TableCell>{row.expected_return_date ?? "-"}</TableCell><TableCell>{row.deduction_amount ?? "-"}</TableCell><TableCell><div className="flex min-w-[390px] justify-end gap-1">{row.assignment_status === "ISSUED" && canReturn ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "action", row, action: "return" })}>Return</Button> : null}{row.assignment_status === "ISSUED" && canDamage ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "action", row, action: "mark-damaged" })}>Damage</Button> : null}{row.assignment_status === "ISSUED" && canLost ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "action", row, action: "mark-lost" })}>Lost</Button> : null}{canDeduct ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "action", row, action: "apply-deduction" })}>Deduct</Button> : null}{canDeduct ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "action", row, action: "waive" })}>Waive</Button> : null}<Link to={`/employees/${row.employee_id}`}><Button variant="ghost" size="sm">Employee 360</Button></Link></div></TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <EmptyState title="No uniform assignments" description="Uniform assignments appear after stock is issued to employees." /> : null}</TableWrap></Panel>
      {modal?.type === "issue" ? <IssueUniformModal employees={employees} stock={availableStock} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "action" ? <UniformActionModal row={modal.row} action={modal.action} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </div>
  );
}

function UniformTypeModal({ row, onClose, onSaved }: { row?: UniformType; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    code: row?.code ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    category: row?.category ?? "SHIRT",
    default_replacement_cycle_months: String(row?.default_replacement_cycle_months ?? ""),
    default_deduction_amount: String(row?.default_deduction_amount ?? ""),
    is_active: isOn(row?.is_active ?? true)
  });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      const payload = { ...form, default_replacement_cycle_months: form.default_replacement_cycle_months ? Number(form.default_replacement_cycle_months) : null, default_deduction_amount: form.default_deduction_amount ? Number(form.default_deduction_amount) : null };
      if (row) await api.updateUniformType(token, row.id, payload);
      else await api.createUniformType(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save uniform type.");
    }
  }
  return <Dialog title={row ? "Edit uniform type" : "Create uniform type"} error={error} onClose={onClose} onSave={save}><Field label="Code"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field><Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Category"><Select value={form.category} onChange={(value) => setForm({ ...form, category: value })}>{uniformTypeCategories.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field><Field label="Replacement cycle months"><Input type="number" value={form.default_replacement_cycle_months} onChange={(event) => setForm({ ...form, default_replacement_cycle_months: event.target.value })} /></Field><Field label="Default deduction amount"><Input type="number" value={form.default_deduction_amount} onChange={(event) => setForm({ ...form, default_deduction_amount: event.target.value })} /></Field><label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label><div className="md:col-span-2"><Field label="Description"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></div></Dialog>;
}

function UniformStockModal({ row, types, locations, onClose, onSaved }: { row?: UniformStockItem; types: UniformType[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    uniform_type_id: row?.uniform_type_id ?? types[0]?.id ?? "",
    size_label: row?.size_label ?? "",
    location_id: row?.location_id ?? "",
    total_quantity: String(row?.total_quantity ?? 0),
    available_quantity: String(row?.available_quantity ?? 0),
    issued_quantity: String(row?.issued_quantity ?? 0),
    damaged_quantity: String(row?.damaged_quantity ?? 0),
    lost_quantity: String(row?.lost_quantity ?? 0),
    retired_quantity: String(row?.retired_quantity ?? 0),
    reorder_level: String(row?.reorder_level ?? ""),
    status: row?.status ?? "ACTIVE"
  });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => key.endsWith("quantity") || key === "reorder_level" ? [key, value === "" ? null : Number(value)] : [key, value || null]));
      if (row) await api.updateUniformStock(token, row.id, payload);
      else await api.createUniformStock(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save uniform stock.");
    }
  }
  return <Dialog title={row ? "Edit uniform stock" : "Create uniform stock"} error={error} onClose={onClose} onSave={save}><Field label="Uniform type"><Select value={form.uniform_type_id} onChange={(value) => setForm({ ...form, uniform_type_id: value })}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></Field><Field label="Size"><Input value={form.size_label} onChange={(event) => setForm({ ...form, size_label: event.target.value })} /></Field><Field label="Location"><Select value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })}><option value="">No location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field><Field label="Status"><Select value={form.status} onChange={(value) => setForm({ ...form, status: value })}>{["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>{(["total_quantity", "available_quantity", "issued_quantity", "damaged_quantity", "lost_quantity", "retired_quantity", "reorder_level"] as const).map((key) => <Field key={key} label={key.replace(/_/g, " ")}><Input type="number" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></Field>)}</Dialog>;
}

function IssueUniformModal({ employees, stock, onClose, onSaved }: { employees: Employee[]; stock: UniformStockItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState({ employee_id: employees[0]?.id ?? "", uniform_stock_item_id: stock[0]?.id ?? "", quantity_issued: "1", issued_date: new Date().toISOString().slice(0, 10), expected_return_date: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.issueUniformAssignment(token, { ...form, quantity_issued: Number(form.quantity_issued), expected_return_date: form.expected_return_date || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to issue uniform.");
    }
  }
  return <Dialog title="Issue uniform" error={error} onClose={onClose} onSave={save} saveLabel="Issue"><Field label="Employee"><Select value={form.employee_id} onChange={(value) => setForm({ ...form, employee_id: value })}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no} / {employee.full_name}</option>)}</Select></Field><Field label="Uniform stock"><Select value={form.uniform_stock_item_id} onChange={(value) => setForm({ ...form, uniform_stock_item_id: value })}>{stock.map((item) => <option key={item.id} value={item.id}>{item.uniform_type_name} / {item.size_label ?? "-"} / {item.available_quantity} available</option>)}</Select></Field><Field label="Quantity"><Input type="number" value={form.quantity_issued} onChange={(event) => setForm({ ...form, quantity_issued: event.target.value })} /></Field><Field label="Issued date"><Input type="date" value={form.issued_date} onChange={(event) => setForm({ ...form, issued_date: event.target.value })} /></Field><Field label="Expected return"><Input type="date" value={form.expected_return_date} onChange={(event) => setForm({ ...form, expected_return_date: event.target.value })} /></Field><Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></Dialog>;
}

function UniformActionModal({ row, action, onClose, onSaved }: { row: UniformAssignment; action: "return" | "mark-damaged" | "mark-lost" | "apply-deduction" | "waive"; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deductionAmount, setDeductionAmount] = useState(String(row.deduction_amount ?? ""));
  const [error, setError] = useState<string | null>(null);
  const needsQuantity = ["return", "mark-damaged", "mark-lost"].includes(action);
  const needsDeduction = action === "apply-deduction" || action === "mark-damaged" || action === "mark-lost";
  async function save() {
    if (!token) return;
    try {
      await api.uniformAssignmentAction(token, row.id, action, { reason, quantity: Number(quantity), quantity_returned: Number(quantity), deduction_amount: deductionAmount ? Number(deductionAmount) : null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update uniform assignment.");
    }
  }
  return <Dialog title={`${action.replace("-", " ")} uniform`} error={error} onClose={onClose} onSave={save}>{needsQuantity ? <Field label="Quantity"><Input type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field> : null}{needsDeduction ? <Field label="Deduction amount"><Input type="number" value={deductionAmount} onChange={(event) => setDeductionAmount(event.target.value)} /></Field> : null}<div className="md:col-span-2"><Field label="Reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field></div></Dialog>;
}

function Header({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-lg font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex gap-2">{action}</div></div>;
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Alert({ tone: alertTone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  return <div className={alertTone === "danger" ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"}>{children}</div>;
}

function Dialog({ title, error, children, saveLabel = "Save", onClose, onSave }: { title: string; error: string | null; children: ReactNode; saveLabel?: string; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid max-h-[65vh] gap-3 overflow-auto p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}><FilePlus className="h-4 w-4" />{saveLabel}</Button></div></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Select({ value, onChange, disabled, children }: { value: string; onChange: (value: string) => void; disabled?: boolean; children: ReactNode }) {
  return <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}
