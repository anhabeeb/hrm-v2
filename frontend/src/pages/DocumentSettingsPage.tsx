import { Pencil, Plus, Power } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { DocumentCategory, DocumentRequiredRule, DocumentType, DocumentTypeInput } from "../types/documents";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

type Tab = "categories" | "types" | "rules";

const defaultType: DocumentTypeInput = {
  category_id: "",
  code: "",
  name: "",
  description: "",
  is_sensitive: false,
  expiring_soon_days: 30,
  allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
  max_file_size_mb: 10,
  allow_multiple_files: false,
  requires_expiry_date: false,
  requires_issue_date: false,
  requires_document_number: false,
  sort_order: 100
};

export function DocumentSettingsPage() {
  const { token, user } = useAuth();
  const canManage = Boolean(user?.permissions.includes("documents.settings.manage"));
  const canRules = Boolean(user?.permissions.includes("documents.required_rules.manage"));
  const canView = Boolean(user?.permissions.includes("documents.view"));
  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [rules, setRules] = useState<DocumentRequiredRule[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [categoryModal, setCategoryModal] = useState<DocumentCategory | "new" | null>(null);
  const [typeModal, setTypeModal] = useState<DocumentType | "new" | null>(null);
  const [ruleModal, setRuleModal] = useState<DocumentRequiredRule | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [categoryResult, typeResult, ruleResult, departmentResult, positionResult, locationResult] = await Promise.all([
        api.listDocumentCategories(token),
        api.listDocumentTypes(token),
        api.listDocumentRequiredRules(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setCategories(categoryResult.categories);
      setTypes(typeResult.document_types);
      setRules(ruleResult.rules);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load document settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  async function categoryAction(category: DocumentCategory) {
    if (!token) return;
    await api.documentCategoryAction(token, category.id, category.is_active ? "disable" : "enable");
    await load();
  }

  async function typeAction(type: DocumentType) {
    if (!token) return;
    await api.documentTypeAction(token, type.id, type.is_active ? "disable" : "enable");
    await load();
  }

  async function ruleAction(rule: DocumentRequiredRule) {
    if (!token) return;
    await api.documentRequiredRuleAction(token, rule.id, rule.is_active ? "disable" : "enable");
    await load();
  }

  if (!canView) return <Panel><EmptyState title="Document settings unavailable" description="Your account needs documents.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Document Management Settings</h1>
        <p className="text-sm text-muted-foreground">Document categories, types, required rules, and compliance foundations.</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {(["categories", "types", "rules"] as Tab[]).map((item) => <button key={item} className={`h-11 border-b-2 px-4 text-sm font-medium ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`} onClick={() => setTab(item)}>{item === "categories" ? "Categories" : item === "types" ? "Document Types" : "Required Rules"}</button>)}
        </div>
        {tab === "categories" ? <Categories categories={categories} canManage={canManage} onNew={() => setCategoryModal("new")} onEdit={setCategoryModal} onAction={(item) => void categoryAction(item)} loading={loading} /> : null}
        {tab === "types" ? <Types types={types} canManage={canManage} onNew={() => setTypeModal("new")} onEdit={setTypeModal} onAction={(item) => void typeAction(item)} loading={loading} /> : null}
        {tab === "rules" ? <Rules rules={rules} canManage={canRules} onNew={() => setRuleModal("new")} onEdit={setRuleModal} onAction={(item) => void ruleAction(item)} loading={loading} /> : null}
      </Panel>
      {categoryModal ? <CategoryModal token={token!} category={categoryModal === "new" ? undefined : categoryModal} onClose={() => setCategoryModal(null)} onSaved={load} /> : null}
      {typeModal ? <TypeModal token={token!} type={typeModal === "new" ? undefined : typeModal} categories={categories} onClose={() => setTypeModal(null)} onSaved={load} /> : null}
      {ruleModal ? <RuleModal token={token!} rule={ruleModal === "new" ? undefined : ruleModal} types={types} departments={departments} positions={positions} locations={locations} onClose={() => setRuleModal(null)} onSaved={load} /> : null}
    </div>
  );
}

function Categories({ categories, canManage, onNew, onEdit, onAction, loading }: { categories: DocumentCategory[]; canManage: boolean; onNew: () => void; onEdit: (row: DocumentCategory) => void; onAction: (row: DocumentCategory) => void; loading: boolean }) {
  return <div><Toolbar canManage={canManage} label="Create category" onNew={onNew} /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Sort</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{categories.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.description ?? "-"}</TableCell><TableCell>{row.sort_order}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={row.is_active} /></TableCell></TableRow>)}</TableBody></Table></div>{loading ? <EmptyState title="Loading categories" description="Fetching document categories." /> : categories.length === 0 ? <EmptyState title="No categories" description="Create categories for document grouping." /> : null}</div>;
}

function Types({ types, canManage, onNew, onEdit, onAction, loading }: { types: DocumentType[]; canManage: boolean; onNew: () => void; onEdit: (row: DocumentType) => void; onAction: (row: DocumentType) => void; loading: boolean }) {
  return <div><Toolbar canManage={canManage} label="Create type" onNew={onNew} /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Rules</TableHead><TableHead>File limits</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{types.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}{row.is_sensitive ? <Badge className="ml-2" tone="warning">Sensitive</Badge> : null}</TableCell><TableCell>{row.category_name ?? "-"}</TableCell><TableCell className="text-xs">{[row.requires_document_number ? "No" : null, row.requires_issue_date ? "Issue" : null, row.requires_expiry_date ? "Expiry" : null].filter(Boolean).join(", ") || "-"}</TableCell><TableCell>{row.max_file_size_mb} MB</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={row.is_active} /></TableCell></TableRow>)}</TableBody></Table></div>{loading ? <EmptyState title="Loading document types" description="Fetching type registry." /> : types.length === 0 ? <EmptyState title="No document types" description="Create predefined document types." /> : null}</div>;
}

function Rules({ rules, canManage, onNew, onEdit, onAction, loading }: { rules: DocumentRequiredRule[]; canManage: boolean; onNew: () => void; onEdit: (row: DocumentRequiredRule) => void; onAction: (row: DocumentRequiredRule) => void; loading: boolean }) {
  return <div><Toolbar canManage={canManage} label="Create required rule" onNew={onNew} /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Document type</TableHead><TableHead>Employee type</TableHead><TableHead>Employment type</TableHead><TableHead>Department</TableHead><TableHead>Position</TableHead><TableHead>Location</TableHead><TableHead>Required</TableHead><TableHead>Priority</TableHead><TableHead>Custom condition</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rules.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.document_type_name ?? row.document_type_id}</TableCell><TableCell>{row.employee_type ?? "Any"}</TableCell><TableCell>{row.employment_type ?? "Any"}</TableCell><TableCell>{row.department_name ?? "Any"}</TableCell><TableCell>{row.position_title ?? "Any"}</TableCell><TableCell>{row.location_name ?? "Any"}</TableCell><TableCell>{row.is_required ? "Yes" : "No"}</TableCell><TableCell>{row.rule_priority}</TableCell><TableCell className="max-w-56 truncate font-mono text-xs">{row.custom_condition_json ?? "-"}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={row.is_active} /></TableCell></TableRow>)}</TableBody></Table></div>{loading ? <EmptyState title="Loading required rules" description="Fetching rule registry." /> : rules.length === 0 ? <EmptyState title="No required rules" description="Create rules to track missing documents." /> : null}</div>;
}

function Toolbar({ canManage, label, onNew }: { canManage: boolean; label: string; onNew: () => void }) {
  return <div className="flex justify-end border-b p-3">{canManage ? <Button size="sm" onClick={onNew}><Plus className="h-4 w-4" /> {label}</Button> : null}</div>;
}

function Actions({ canManage, onEdit, onAction, active }: { canManage: boolean; onEdit: () => void; onAction: () => void; active: boolean }) {
  if (!canManage) return <div className="text-right text-xs text-muted-foreground">Read only</div>;
  return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={onAction} title={active ? "Disable" : "Enable"}><Power className="h-4 w-4" /></Button></div>;
}

function CategoryModal({ token, category, onClose, onSaved }: { token: string; category?: DocumentCategory; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sort, setSort] = useState(String(category?.sort_order ?? 100));
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      const input = { name, description, sort_order: Number(sort) || 100 };
      if (category) await api.updateDocumentCategory(token, category.id, input);
      else await api.createDocumentCategory(token, input);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save category.");
    }
  }
  return <Modal title={category ? "Edit category" : "Create category"} error={error} onClose={onClose} onSave={save}><Field label="Name" value={name} onChange={setName} /><Field label="Description" value={description} onChange={setDescription} /><Field label="Sort order" type="number" value={sort} onChange={setSort} /></Modal>;
}

function TypeModal({ token, type, categories, onClose, onSaved }: { token: string; type?: DocumentType; categories: DocumentCategory[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<DocumentTypeInput>(() => type ? {
    category_id: type.category_id ?? "",
    code: type.code,
    name: type.name,
    description: type.description ?? "",
    is_sensitive: type.is_sensitive,
    expiring_soon_days: type.expiring_soon_days,
    allowed_file_types: type.allowed_file_types ?? ["application/pdf", "image/jpeg", "image/png"],
    max_file_size_mb: type.max_file_size_mb,
    allow_multiple_files: type.allow_multiple_files,
    requires_expiry_date: type.requires_expiry_date,
    requires_issue_date: type.requires_issue_date,
    requires_document_number: type.requires_document_number,
    sort_order: type.sort_order
  } : defaultType);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof DocumentTypeInput, value: string | number | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    try {
      if (type) await api.updateDocumentType(token, type.id, form);
      else await api.createDocumentType(token, form);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save document type.");
    }
  }
  return (
    <Modal title={type ? "Edit document type" : "Create document type"} error={error} onClose={onClose} onSave={save}>
      <div className="md:col-span-2"><Label>Category</Label><select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.category_id ?? ""} onChange={(event) => update("category_id", event.target.value)}><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <Field label="Code" value={form.code} onChange={(value) => update("code", value)} />
      <Field label="Name" value={form.name} onChange={(value) => update("name", value)} />
      <Field label="Description" value={form.description ?? ""} onChange={(value) => update("description", value)} />
      <Field label="Expiring soon days" type="number" value={String(form.expiring_soon_days)} onChange={(value) => update("expiring_soon_days", Number(value) || 0)} />
      <Field label="Max file size MB" type="number" value={String(form.max_file_size_mb)} onChange={(value) => update("max_file_size_mb", Number(value) || 1)} />
      <Field label="Sort order" type="number" value={String(form.sort_order)} onChange={(value) => update("sort_order", Number(value) || 100)} />
      <div className="md:col-span-2"><Field label="Allowed file types" value={form.allowed_file_types.join(", ")} onChange={(value) => update("allowed_file_types", value.split(",").map((item) => item.trim()).filter(Boolean))} /></div>
      {(["is_sensitive", "allow_multiple_files", "requires_document_number", "requires_issue_date", "requires_expiry_date"] as const).map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked)} /> {key.replace(/_/g, " ")}</label>)}
    </Modal>
  );
}

function RuleModal({
  token,
  rule,
  types,
  departments,
  positions,
  locations,
  onClose,
  onSaved
}: {
  token: string;
  rule?: DocumentRequiredRule;
  types: DocumentType[];
  departments: OrganizationDepartment[];
  positions: OrganizationPosition[];
  locations: OrganizationLocation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [documentTypeId, setDocumentTypeId] = useState(rule?.document_type_id ?? types[0]?.id ?? "");
  const [employeeType, setEmployeeType] = useState(rule?.employee_type ?? "");
  const [employmentType, setEmploymentType] = useState(rule?.employment_type ?? "");
  const [departmentId, setDepartmentId] = useState(rule?.department_id ?? "");
  const [positionId, setPositionId] = useState(rule?.position_id ?? "");
  const [locationId, setLocationId] = useState(rule?.location_id ?? "");
  const [isRequired, setIsRequired] = useState(rule?.is_required === undefined ? true : Boolean(rule.is_required));
  const [priority, setPriority] = useState(String(rule?.rule_priority ?? 100));
  const [customCondition, setCustomCondition] = useState(rule?.custom_condition_json ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      const input = {
        document_type_id: documentTypeId,
        employee_type: employeeType || null,
        employment_type: employmentType || null,
        department_id: departmentId || null,
        position_id: positionId || null,
        location_id: locationId || null,
        is_required: isRequired,
        rule_priority: Number(priority) || 100,
        custom_condition_json: customCondition || null
      };
      if (rule) await api.updateDocumentRequiredRule(token, rule.id, input);
      else await api.createDocumentRequiredRule(token, input);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save required rule.");
    }
  }
  return (
    <Modal title={rule ? "Edit required rule" : "Create required rule"} error={error} onClose={onClose} onSave={save}>
      <div className="md:col-span-2"><Label>Document type</Label><select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)}>{types.filter((type) => type.is_active).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
      <Select label="Employee type" value={employeeType} onChange={setEmployeeType} options={["", "LOCAL", "FOREIGN", "OTHER"]} />
      <Select label="Employment type" value={employmentType} onChange={setEmploymentType} options={["", "FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]} />
      <OptionSelect label="Department" value={departmentId} onChange={setDepartmentId} options={departments.map((item) => ({ value: item.id, label: item.name }))} />
      <OptionSelect label="Position/designation" value={positionId} onChange={setPositionId} options={positions.map((item) => ({ value: item.id, label: item.title }))} />
      <OptionSelect label="Outlet/location" value={locationId} onChange={setLocationId} options={locations.map((item) => ({ value: item.id, label: item.name }))} />
      <Field label="Rule priority" type="number" value={priority} onChange={setPriority} />
      <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} /> Required document</label>
      <div className="md:col-span-2"><Label>Custom condition JSON</Label><textarea className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs" value={customCondition} onChange={(event) => setCustomCondition(event.target.value)} placeholder='{"future":"condition"}' /></div>
    </Modal>
  );
}

function Modal({ title, error, children, onClose, onSave }: { title: string; error: string | null; children: ReactNode; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>Save</Button></div></div></div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "any"} value={option}>{option || "Any"}</option>)}</select></div>;
}

function OptionSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Any</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
