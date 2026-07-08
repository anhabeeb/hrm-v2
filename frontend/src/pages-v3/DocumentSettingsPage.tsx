import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField, CheckboxField, type StandardTabItem } from "../components/ui/page-shell";
import { NavRail } from "../components/ui/nav-rail";
import { Panel } from "../components/ui/panel";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import type { DocumentCategory, DocumentRequiredRule, DocumentType, DocumentTypeInput } from "../types/documents";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";

const TAB_ITEMS: StandardTabItem[] = [
  { key: "categories", label: "Categories" },
  { key: "types", label: "Document types" },
  { key: "rules", label: "Required rules" }
];

const DEFAULT_TYPE: DocumentTypeInput = {
  category_id: "", code: "", name: "", description: "", is_sensitive: false, expiring_soon_days: 30,
  allowed_file_types: ["application/pdf", "image/jpeg", "image/png"], max_file_size_mb: 10, allow_multiple_files: false,
  requires_expiry_date: false, requires_issue_date: false, requires_document_number: false, sort_order: 100
};

export function DocumentSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("documents.settings.manage"));
  const canRules = Boolean(user?.permissions.includes("documents.required_rules.manage"));
  const canView = Boolean(user?.permissions.includes("documents.view"));
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [rules, setRules] = useState<DocumentRequiredRule[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [categoryModal, setCategoryModal] = useState<DocumentCategory | "new" | null>(null);
  const [typeModal, setTypeModal] = useState<DocumentType | "new" | null>(null);
  const [ruleModal, setRuleModal] = useState<DocumentRequiredRule | "new" | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const [categoryResult, typeResult, ruleResult, departmentResult, positionResult, jobLevelResult, locationResult] = await Promise.all([
        api.listDocumentCategories(token), api.listDocumentTypes(token), api.listDocumentRequiredRules(token),
        api.listDepartments(token), api.listPositions(token), api.listJobLevels(token), api.listLocations(token)
      ]);
      setCategories(categoryResult.categories);
      setTypes(typeResult.document_types);
      setRules(ruleResult.rules);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setJobLevels(jobLevelResult.job_levels);
      setLocations(locationResult.locations);
    } catch (err) {
      alerts.showApiError(err, "Unable to load document settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function categoryAction(row: DocumentCategory) {
    if (!token) return;
    try { await api.documentCategoryAction(token, row.id, row.is_active ? "disable" : "enable"); alerts.showSuccess("Category updated", `${row.name} was ${row.is_active ? "disabled" : "enabled"}.`); await load(); } catch (err) { alerts.showApiError(err, "Unable to update category."); }
  }
  async function typeAction(row: DocumentType) {
    if (!token) return;
    try { await api.documentTypeAction(token, row.id, row.is_active ? "disable" : "enable"); alerts.showSuccess("Type updated", `${row.name} was ${row.is_active ? "disabled" : "enabled"}.`); await load(); } catch (err) { alerts.showApiError(err, "Unable to update type."); }
  }
  async function ruleAction(row: DocumentRequiredRule) {
    if (!token) return;
    try { await api.documentRequiredRuleAction(token, row.id, row.is_active ? "disable" : "enable"); alerts.showSuccess("Rule updated", `Rule ${row.is_active ? "disabled" : "enabled"}.`); await load(); } catch (err) { alerts.showApiError(err, "Unable to update rule."); }
  }

  if (!canView) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Document settings unavailable" description="Your account needs documents.view permission." /></Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <NavRail items={TAB_ITEMS} active={tab} onChange={setTab} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Document management settings</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Document categories, types, required rules, and compliance foundations</p>
            </div>
            {tab === "categories" && canManage ? <Button size="sm" onClick={() => setCategoryModal("new")}><Plus className="h-4 w-4" /> Create category</Button> : null}
            {tab === "types" && canManage ? <Button size="sm" onClick={() => setTypeModal("new")}><Plus className="h-4 w-4" /> Create type</Button> : null}
            {tab === "rules" && canRules ? <Button size="sm" onClick={() => setRuleModal("new")}><Plus className="h-4 w-4" /> Create rule</Button> : null}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : tab === "categories" ? (
            categories.length ? (
              <div className="flex flex-col gap-2">
                {categories.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{row.description ?? "No description"} · Sort {row.sort_order}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit category" onClick={() => setCategoryModal(row)}>Edit</RowActionButton>
                        <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void categoryAction(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No categories" description="Create categories for document grouping." /></Panel>
          ) : tab === "types" ? (
            types.length ? (
              <div className="flex flex-col gap-2">
                {types.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span>{row.is_sensitive ? <span className="ml-2 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[9px] font-medium text-[#854F0B]">Sensitive</span> : null}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{row.category_name ?? "No category"} · {[row.requires_document_number ? "No" : null, row.requires_issue_date ? "Issue" : null, row.requires_expiry_date ? "Expiry" : null].filter(Boolean).join(", ") || "No extra rules"} · {row.max_file_size_mb} MB max</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit type" onClick={() => setTypeModal(row)}>Edit</RowActionButton>
                        <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void typeAction(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No document types" description="Create predefined document types." /></Panel>
          ) : (
            rules.length ? (
              <div className="flex flex-col gap-2">
                {rules.map((row) => (
                  <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{row.document_type_name ?? row.document_type_id}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Employee {row.employee_type ?? "Any"} · Employment {row.employment_type ?? "Any"} · {row.department_name ?? "Any department"} · {row.position_title ?? "Any position"} · {row.location_name ?? "Any location"} · Priority {row.rule_priority}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_required ? "#FAEEDA" : "#F7F7FB", color: row.is_required ? "#854F0B" : "#6B6F86" }}>{row.is_required ? "Required" : "Optional"}</span>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                    {canRules ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit rule" onClick={() => setRuleModal(row)}>Edit</RowActionButton>
                        <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void ruleAction(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            ) : <Panel><EmptyState title="No required rules" description="Create rules to track missing documents." /></Panel>
          )}
        </div>
      </div>

      {categoryModal ? <CategoryModal category={categoryModal === "new" ? undefined : categoryModal} onClose={() => setCategoryModal(null)} onSaved={() => { setCategoryModal(null); void load(); }} /> : null}
      {typeModal ? <TypeModal type={typeModal === "new" ? undefined : typeModal} categories={categories} onClose={() => setTypeModal(null)} onSaved={() => { setTypeModal(null); void load(); }} /> : null}
      {ruleModal ? <RuleModal rule={ruleModal === "new" ? undefined : ruleModal} types={types} departments={departments} positions={positions} jobLevels={jobLevels} locations={locations} onClose={() => setRuleModal(null)} onSaved={() => { setRuleModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: DocumentCategory; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sort, setSort] = useState(String(category?.sort_order ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try {
      const input = { name, description, sort_order: Number(sort) || 100 };
      if (category) await api.updateDocumentCategory(token, category.id, input);
      else await api.createDocumentCategory(token, input);
      alerts.showSuccess("Category saved", "The document category was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{category ? "Edit category" : "Create category"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} /></div>
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

function TypeModal({ type, categories, onClose, onSaved }: { type?: DocumentType; categories: DocumentCategory[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState<DocumentTypeInput>(() => type ? {
    category_id: type.category_id ?? "", code: type.code, name: type.name, description: type.description ?? "",
    is_sensitive: type.is_sensitive, expiring_soon_days: type.expiring_soon_days,
    allowed_file_types: type.allowed_file_types ?? ["application/pdf", "image/jpeg", "image/png"],
    max_file_size_mb: type.max_file_size_mb, allow_multiple_files: type.allow_multiple_files,
    requires_expiry_date: type.requires_expiry_date, requires_issue_date: type.requires_issue_date,
    requires_document_number: type.requires_document_number, sort_order: type.sort_order
  } : DEFAULT_TYPE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof DocumentTypeInput>(key: K, value: DocumentTypeInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!token) return;
    if (!form.code.trim() || !form.name.trim()) { setError("Code and name are required."); return; }
    setSaving(true);
    try {
      if (type) await api.updateDocumentType(token, type.id, form);
      else await api.createDocumentType(token, form);
      alerts.showSuccess("Type saved", "The document type was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save document type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{type ? "Edit document type" : "Create document type"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Category</Label><SelectField value={form.category_id ?? ""} onValueChange={(v) => update("category_id", v)}><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => update("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Expiring soon days</Label><Input type="number" min={0} value={form.expiring_soon_days} onChange={(e) => update("expiring_soon_days", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Max file size MB</Label><Input type="number" min={1} value={form.max_file_size_mb} onChange={(e) => update("max_file_size_mb", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" min={0} value={form.sort_order} onChange={(e) => update("sort_order", Number(e.target.value))} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Allowed file types (comma-separated)</Label><Input value={form.allowed_file_types.join(", ")} onChange={(e) => update("allowed_file_types", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} /></div>
            <CheckboxField label="Sensitive" checked={Boolean(form.is_sensitive)} onChange={(v) => update("is_sensitive", v)} />
            <CheckboxField label="Allow multiple files" checked={Boolean(form.allow_multiple_files)} onChange={(v) => update("allow_multiple_files", v)} />
            <CheckboxField label="Requires document number" checked={Boolean(form.requires_document_number)} onChange={(v) => update("requires_document_number", v)} />
            <CheckboxField label="Requires issue date" checked={Boolean(form.requires_issue_date)} onChange={(v) => update("requires_issue_date", v)} />
            <CheckboxField label="Requires expiry date" checked={Boolean(form.requires_expiry_date)} onChange={(v) => update("requires_expiry_date", v)} />
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

function RuleModal({ rule, types, departments, positions, jobLevels, locations, onClose, onSaved }: { rule?: DocumentRequiredRule; types: DocumentType[]; departments: OrganizationDepartment[]; positions: OrganizationPosition[]; jobLevels: OrganizationJobLevel[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [documentTypeId, setDocumentTypeId] = useState(rule?.document_type_id ?? types[0]?.id ?? "");
  const [employeeType, setEmployeeType] = useState(rule?.employee_type ?? "");
  const [employmentType, setEmploymentType] = useState(rule?.employment_type ?? "");
  const [departmentId, setDepartmentId] = useState(rule?.department_id ?? "");
  const [positionId, setPositionId] = useState(rule?.position_id ?? "");
  const [jobLevelId, setJobLevelId] = useState("");
  const [locationId, setLocationId] = useState(rule?.location_id ?? "");
  const [isRequired, setIsRequired] = useState(rule?.is_required === undefined ? true : Boolean(rule.is_required));
  const [priority, setPriority] = useState(String(rule?.rule_priority ?? 100));
  const [customCondition, setCustomCondition] = useState(rule?.custom_condition_json ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || !documentTypeId) { setError("Document type is required."); return; }
    setSaving(true);
    try {
      const input = {
        document_type_id: documentTypeId, employee_type: employeeType || null, employment_type: employmentType || null,
        department_id: departmentId || null, position_id: positionId || null, location_id: locationId || null,
        is_required: isRequired, rule_priority: Number(priority) || 100, custom_condition_json: customCondition || null
      };
      if (rule) await api.updateDocumentRequiredRule(token, rule.id, input);
      else await api.createDocumentRequiredRule(token, input);
      alerts.showSuccess("Rule saved", "The required document rule was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save required rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{rule ? "Edit required rule" : "Create required rule"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Document type</Label><SelectField value={documentTypeId} onValueChange={setDocumentTypeId}>{types.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Employee type</Label><SelectField value={employeeType} onValueChange={setEmployeeType}><option value="">Any</option>{["LOCAL", "FOREIGN", "OTHER"].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Employment type</Label><SelectField value={employmentType} onValueChange={setEmploymentType}><option value="">Any</option>{["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((v) => <option key={v} value={v}>{humanizeTechnicalLabel(v)}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Department</Label><SelectField value={departmentId} onValueChange={setDepartmentId}><option value="">Any</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Position</Label><SelectField value={positionId} onValueChange={setPositionId}><option value="">Any</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Job level</Label><SelectField value={jobLevelId} onValueChange={setJobLevelId}><option value="">Any</option>{jobLevels.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Location</Label><SelectField value={locationId} onValueChange={setLocationId}><option value="">Any</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Rule priority</Label><Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
            <div className="flex items-end pb-1"><CheckboxField label="Required document" checked={isRequired} onChange={setIsRequired} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Custom condition JSON (optional)</Label><textarea className="min-h-20 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs" value={customCondition} onChange={(e) => setCustomCondition(e.target.value)} placeholder='{"future":"condition"}' /></div>
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
