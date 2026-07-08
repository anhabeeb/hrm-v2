import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { AssetAssignment, AssetAssignmentEvent, AssetCategory, AssetItem } from "../types/assets";
import type { Employee } from "../types/employees";
import type { OrganizationLocation } from "../types/organization";

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
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function conditionTone(condition: string | null) {
  if (condition === "DAMAGED") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (condition === "FAIR") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#EAF3DE", text: "#27500A" };
}

export function AssetAssignmentsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canReturn = permissions.has("assets.return");
  const canIssue = permissions.has("assets.issue");

  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [availableItems, setAvailableItems] = useState<AssetItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [status, setStatus] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [eventsTarget, setEventsTarget] = useState<AssetAssignment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [assignmentResult, itemResult, employeeResult, categoryResult, locationResult] = await Promise.all([
        api.listAssetAssignments(token, { search, category_id: categoryId === "all" ? undefined : categoryId, location_id: locationId === "all" ? undefined : locationId, status: status === "all" ? undefined : status }),
        api.listAssetItems(token, { status: "AVAILABLE" }),
        api.listEmployees(token, { limit: 300, offset: 0 }),
        api.listAssetCategories(token),
        api.listLocations(token)
      ]);
      setAssignments(assignmentResult.assignments ?? []);
      setAvailableItems(itemResult.items ?? []);
      setEmployees(employeeResult.employees ?? []);
      setCategories(categoryResult.categories ?? []);
      setLocations(locationResult.locations ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset assignments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, search, categoryId, locationId, status]);

  function resetFilters() {
    setSearch("");
    setCategoryId("all");
    setLocationId("all");
    setStatus("all");
  }

  async function markReturned(assignment: AssetAssignment) {
    if (!token) return;
    setBusyId(assignment.id);
    try {
      await api.assetAssignmentAction(token, assignment.id, "return", {});
      alerts.showSuccess("Asset returned", `${assignment.asset_name} was marked as returned.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to mark asset as returned");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ASSETS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Assignments</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Who has what, and its condition</p>
            </div>
            {canIssue ? <Button size="sm" onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" /> Assign item</Button> : null}
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee or item" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="all">Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">Outlet/location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Status</option>
                {["ISSUED", "RETURNED", "DAMAGED", "LOST", "REPLACED", "WRITTEN_OFF"].map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <div className="flex flex-wrap items-center gap-3.5 border-t border-[#E7E7F1] pt-2.5">
                <button type="button" onClick={resetFilters} className="text-xs text-muted-foreground hover:text-slate-900">Reset all</button>
              </div>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : assignments.length ? (
            <div className="flex flex-col gap-2">
              {assignments.map((assignment) => {
                const color = colorFor(assignment.employee_name ?? "?");
                const overdue = assignment.status === "ISSUED" && Boolean(assignment.expected_return_date && assignment.expected_return_date < todayIso());
                const condition = assignment.condition_on_return ?? assignment.condition_on_issue;
                const tone = conditionTone(condition);
                return (
                  <Panel key={assignment.id} className="flex items-center gap-3.5 p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(assignment.employee_name ?? "?")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{assignment.employee_name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{assignment.asset_name}{assignment.asset_code ? ` · ${assignment.asset_code}` : ""} · Assigned {assignment.issued_date ?? assignment.issued_at}</p>
                    </div>
                    {condition ? <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{humanizeTechnicalLabel(condition)} condition</span> : null}
                    {overdue ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-[#FCEBEB] px-2.5 py-1 text-[10px] font-medium text-[#A32D2D]">Return overdue</span>
                    ) : assignment.status === "ISSUED" ? (
                      <span className="shrink-0 whitespace-nowrap rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-[10px] text-muted-foreground">Active</span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] font-medium text-[#6B6F86]">{humanizeTechnicalLabel(assignment.status)}</span>
                    )}
                    {overdue && canReturn ? (
                      <Button size="sm" loading={busyId === assignment.id} onClick={() => void markReturned(assignment)}>Mark returned</Button>
                    ) : null}
                    <button type="button" className="shrink-0 text-muted-foreground hover:text-slate-900" onClick={() => setEventsTarget(assignment)}>⋮</button>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No asset assignments found" description="Adjust filters or assign an item to an employee." /></Panel>
          )}
        </div>
      </div>

      {issueOpen ? <IssueModal employees={employees} items={availableItems} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); void load(); }} /> : null}
      {eventsTarget ? <EventsDialog assignment={eventsTarget} onClose={() => setEventsTarget(null)} /> : null}
    </PageShell>
  );
}

function EventsDialog({ assignment, onClose }: { assignment: AssetAssignment; onClose: () => void }) {
  const { token } = useAuth();
  const [events, setEvents] = useState<AssetAssignmentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listAssetAssignmentEvents(token, assignment.id).then((res) => setEvents(res.events ?? [])).finally(() => setLoading(false));
  }, [token, assignment.id]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{assignment.asset_name} — history</DialogTitle></DialogHeader>
        <DialogBody>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : events.length ? (
            <div className="space-y-1.5">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded-md bg-[#F7F7FB] px-2.5 py-1.5 text-xs">
                  <span className="text-slate-950">{humanizeTechnicalLabel(event.event_type)}{event.reason ? ` — ${event.reason}` : ""}</span>
                  <span className="text-muted-foreground">{event.event_by_name ?? "System"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No lifecycle events recorded.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueModal({ employees, items, onClose, onSaved }: { employees: Employee[]; items: AssetItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [assetItemId, setAssetItemId] = useState(items[0]?.id ?? "");
  const [issuedDate, setIssuedDate] = useState(todayIso());
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !employeeId || !assetItemId) return;
    setSaving(true);
    setError(null);
    try {
      await api.issueAssetAssignment(token, { employee_id: employeeId, asset_item_id: assetItemId, issued_date: issuedDate, expected_return_date: expectedReturnDate || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to assign item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Assign item</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          {items.length ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Employee</Label>
                <SelectField value={employeeId} onValueChange={setEmployeeId}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </SelectField>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Item</Label>
                <SelectField value={assetItemId} onValueChange={setAssetItemId}>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.code} / {i.name}</option>)}
                </SelectField>
              </div>
              <div className="space-y-1.5"><Label>Issued date</Label><Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Expected return (optional)</Label><Input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} /></div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No available items to assign — all items are currently issued, damaged, or written off.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!employeeId || !assetItemId} onClick={() => void submit()}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
