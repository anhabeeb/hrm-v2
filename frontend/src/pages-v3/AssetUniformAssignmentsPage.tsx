import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shirt } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { UniformAssignment, UniformStockItem } from "../types/assets";
import type { Employee } from "../types/employees";
import type { OrganizationLocation } from "../types/organization";

const STATUSES = ["ISSUED", "RETURNED", "PARTIALLY_RETURNED", "DAMAGED", "LOST", "DEDUCTION_PENDING", "DEDUCTION_APPLIED", "WAIVED", "CANCELLED"];

function tone(status?: string) {
  if (["RETURNED", "CLEARED"].includes(status ?? "")) return { bg: "#EAF3DE", text: "#27500A" };
  if (["DAMAGED", "DEDUCTION_PENDING", "PARTIALLY_RETURNED"].includes(status ?? "")) return { bg: "#FAEEDA", text: "#854F0B" };
  if (["LOST", "CANCELLED"].includes(status ?? "")) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

type ActionType = "return" | "mark-damaged" | "mark-lost" | "apply-deduction" | "waive";

export function AssetUniformAssignmentsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canIssue = Boolean(user?.permissions.includes("uniforms.issue") || user?.permissions.includes("assets.issue"));
  const canReturn = Boolean(user?.permissions.includes("uniforms.return") || user?.permissions.includes("assets.return"));
  const canDamage = Boolean(user?.permissions.includes("uniforms.damage") || user?.permissions.includes("assets.damage"));
  const canLost = Boolean(user?.permissions.includes("uniforms.lost") || user?.permissions.includes("assets.lost"));
  const canDeduct = Boolean(user?.permissions.includes("uniforms.deductions.apply") || user?.permissions.includes("assets.deductions.manage"));
  const [rows, setRows] = useState<UniformAssignment[]>([]);
  const [stock, setStock] = useState<UniformStockItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [actionState, setActionState] = useState<{ row: UniformAssignment; action: ActionType } | null>(null);

  const filters = useMemo(() => ({ search, status: status === "all" ? undefined : status, location_id: locationId === "all" ? undefined : locationId }), [search, status, locationId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [assignmentRows, stockRows, employeeRows, locationRows] = await Promise.all([
        api.listUniformAssignments(token, filters),
        api.listUniformStock(token, { status: "ACTIVE" }),
        api.listEmployees(token, { limit: 500 }),
        api.listLocations(token)
      ]);
      setRows(assignmentRows.assignments ?? []);
      setStock(stockRows.stock ?? []);
      setEmployees(employeeRows.employees ?? []);
      setLocations(locationRows.locations ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load uniform assignments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, filters]);

  const availableStock = stock.filter((row) => row.available_quantity > 0);

  async function runAction(quantity: string, deductionAmount: string, reason: string) {
    if (!token || !actionState) return;
    try {
      await api.uniformAssignmentAction(token, actionState.row.id, actionState.action, { reason, quantity: Number(quantity), quantity_returned: Number(quantity), deduction_amount: deductionAmount ? Number(deductionAmount) : null });
      alerts.showSuccess("Assignment updated", `Uniform assignment ${actionState.action.replace("-", " ")} completed.`);
      setActionState(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update uniform assignment.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Issue, return, damage/lost, waive, and payroll recovery foundation for uniforms</p>
              </div>
              <div className="flex items-center gap-2">
              <ExportMenu variant="plain" moduleName="Uniform assignments" rows={rows as unknown as Record<string, unknown>[]} columns={["employee_no", "employee_name", "department_name", "location_name", "uniform_type_code", "uniform_type_name", "size_label", "quantity_issued", "quantity_returned", "assignment_status", "clearance_status", "issued_date", "expected_return_date", "deduction_amount"]} />
              {canIssue ? <Button size="sm" onClick={() => setIssueOpen(true)}><Shirt className="h-4 w-4" /> Issue uniform</Button> : null}
</div>

              </div>

              <Panel className="shadow-none space-y-3 p-4">

          <Panel className="flex flex-wrap items-center gap-3.5 p-3">
            <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
              <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Employee or uniform" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={status} onValueChange={setStatus}>
              <option value="all">All status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
            </SelectField>
            <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={locationId} onValueChange={setLocationId}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectField>
          </Panel>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{row.employee_no}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.uniform_type_name} ({row.uniform_type_code} / {row.size_label ?? "-"}) · {row.quantity_issued} issued, {row.quantity_returned} returned, {row.quantity_damaged} damaged, {row.quantity_lost} lost</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Issued {row.issued_date} · Expected return {row.expected_return_date ?? "-"}{row.deduction_amount ? ` · Deduction ${row.deduction_amount}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(row.assignment_status).bg, color: tone(row.assignment_status).text }}>{humanizeTechnicalLabel(row.assignment_status)}</span>
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(row.clearance_status).bg, color: tone(row.clearance_status).text }}>{humanizeTechnicalLabel(row.clearance_status)}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {row.assignment_status === "ISSUED" && canReturn ? <RowActionButton intent="release" size="sm" title="Return" onClick={() => setActionState({ row, action: "return" })}>Return</RowActionButton> : null}
                    {row.assignment_status === "ISSUED" && canDamage ? <RowActionButton intent="warning" size="sm" title="Damage" onClick={() => setActionState({ row, action: "mark-damaged" })}>Damage</RowActionButton> : null}
                    {row.assignment_status === "ISSUED" && canLost ? <RowActionButton intent="warning" size="sm" title="Lost" onClick={() => setActionState({ row, action: "mark-lost" })}>Lost</RowActionButton> : null}
                    {canDeduct ? <RowActionButton intent="create" size="sm" title="Deduct" onClick={() => setActionState({ row, action: "apply-deduction" })}>Deduct</RowActionButton> : null}
                    {canDeduct ? <RowActionButton intent="warning" size="sm" title="Waive" onClick={() => setActionState({ row, action: "waive" })}>Waive</RowActionButton> : null}
                    <Link to={`/v3-preview/employees/${row.employee_id}`}><RowActionButton intent="view" size="sm" title="Employee 360">360</RowActionButton></Link>
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No uniform assignments" description="Uniform assignments appear after stock is issued to employees." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {issueOpen ? <IssueUniformModal employees={employees} stock={availableStock} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); void load(); }} /> : null}
      {actionState ? <UniformActionModal action={actionState.action} row={actionState.row} onClose={() => setActionState(null)} onConfirm={runAction} /> : null}
    </PageShell>
  );
}

function IssueUniformModal({ employees, stock, onClose, onSaved }: { employees: Employee[]; stock: UniformStockItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [stockId, setStockId] = useState(stock[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!token || !employeeId || !stockId) { setError("Employee and uniform stock are required."); return; }
    setSaving(true);
    try {
      await api.issueUniformAssignment(token, { employee_id: employeeId, uniform_stock_item_id: stockId, quantity_issued: Number(quantity), issued_date: issuedDate, expected_return_date: expectedReturn || null, notes: notes || null });
      alerts.showSuccess("Uniform issued", "The uniform was issued to the employee.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to issue uniform.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Issue uniform</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Employee</Label><SelectField value={employeeId} onValueChange={setEmployeeId}>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</SelectField></div>
            <div className="col-span-2 space-y-1.5"><Label>Uniform stock</Label><SelectField value={stockId} onValueChange={setStockId}>{stock.map((s) => <option key={s.id} value={s.id}>{s.uniform_type_name} / {s.size_label ?? "-"} / {s.available_quantity} available</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Issued date</Label><Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Expected return</Label><Input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UniformActionModal({ row, action, onClose, onConfirm }: { row: UniformAssignment; action: ActionType; onClose: () => void; onConfirm: (quantity: string, deductionAmount: string, reason: string) => void }) {
  const needsQuantity = ["return", "mark-damaged", "mark-lost"].includes(action);
  const needsDeduction = action === "apply-deduction" || action === "mark-damaged" || action === "mark-lost";
  const [quantity, setQuantity] = useState("1");
  const [deductionAmount, setDeductionAmount] = useState(String(row.deduction_amount ?? ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{humanizeTechnicalLabel(action.replace("-", "_"))} uniform</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            {needsQuantity ? <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div> : null}
            {needsDeduction ? <div className="space-y-1.5"><Label>Deduction amount</Label><Input type="number" min={0} value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} /></div> : null}
            <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (!reason.trim()) { setError("Reason is required."); return; } onConfirm(quantity, deductionAmount, reason); }}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
