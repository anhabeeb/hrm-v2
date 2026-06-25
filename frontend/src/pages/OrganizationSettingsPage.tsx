import { Building2, Eye, Pencil, Plus, RotateCcw, Save, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import type {
  CompanyInput,
  DepartmentInput,
  JobLevelInput,
  LocationInput,
  LocationType,
  OrganizationCompany,
  OrganizationDepartment,
  OrganizationJobLevel,
  OrganizationLocation,
  OrganizationPosition,
  PositionInput
} from "../types/organization";

type TabKey = "company" | "locations" | "departments" | "positions" | "job-levels";
type StatusFilter = "all" | "active" | "inactive";
type ModalMode = "view" | "create" | "edit";
type EntityKind = "location" | "department" | "job-level" | "position";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "company", label: "Company Profile" },
  { key: "locations", label: "Outlets / Locations" },
  { key: "departments", label: "Departments" },
  { key: "positions", label: "Positions / Designations" },
  { key: "job-levels", label: "Job Levels" }
];

const locationTypes: LocationType[] = ["OUTLET", "OFFICE", "WAREHOUSE", "OTHER"];

const emptyCompany: CompanyInput = {
  name: "",
  legal_name: "",
  registration_no: "",
  tax_no: "",
  address: "",
  phone: "",
  email: "",
  status: "ACTIVE"
};

function isActiveAllowed(status: StatusFilter, active: boolean) {
  return status === "all" || (status === "active" && active) || (status === "inactive" && !active);
}

function includesSearch(values: Array<string | null | undefined>, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return values.some((value) => (value ?? "").toLowerCase().includes(needle));
}

function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

function CompanyStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "ACTIVE" ? "success" : "neutral"}>{status}</Badge>;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function PermissionFallback() {
  return (
    <Panel className="overflow-hidden">
      <EmptyState title="Organization settings unavailable" description="Your account needs organization.view permission to open this section." />
    </Panel>
  );
}

interface ModalState {
  kind: EntityKind;
  mode: ModalMode;
  record?: OrganizationLocation | OrganizationDepartment | OrganizationJobLevel | OrganizationPosition;
}

export function OrganizationSettingsPage() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<OrganizationCompany | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyInput>(emptyCompany);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState<"all" | LocationType>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionTarget, setActionTarget] = useState<{ kind: EntityKind; id: string; active: boolean; name: string } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("organization.view");
  const canManage = permissions.has("organization.manage");

  async function loadOrganization() {
    if (!token || !canView) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [companyResult, locationsResult, departmentsResult, jobLevelsResult, positionsResult] = await Promise.all([
        api.getCompany(token),
        api.listLocations(token),
        api.listDepartments(token),
        api.listJobLevels(token),
        api.listPositions(token)
      ]);
      setCompany(companyResult.company);
      setCompanyForm(companyResult.company ? companyToInput(companyResult.company) : emptyCompany);
      setLocations(locationsResult.locations);
      setDepartments(departmentsResult.departments);
      setJobLevels(jobLevelsResult.job_levels);
      setPositions(positionsResult.positions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load organization settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganization();
  }, [token, canView]);

  const filteredLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          isActiveAllowed(statusFilter, location.is_active) &&
          (locationTypeFilter === "all" || location.type === locationTypeFilter) &&
          includesSearch([location.code, location.name, location.island_city, location.address, location.phone], search)
      ),
    [locations, locationTypeFilter, search, statusFilter]
  );

  const filteredDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          isActiveAllowed(statusFilter, department.is_active) &&
          includesSearch([department.code, department.name, department.parent_department_name, department.description], search)
      ),
    [departments, search, statusFilter]
  );

  const filteredJobLevels = useMemo(
    () =>
      jobLevels.filter(
        (level) => isActiveAllowed(statusFilter, level.is_active) && includesSearch([level.code, level.name, level.description], search)
      ),
    [jobLevels, search, statusFilter]
  );

  const filteredPositions = useMemo(
    () =>
      positions.filter(
        (position) =>
          isActiveAllowed(statusFilter, position.is_active) &&
          (departmentFilter === "all" || position.department_id === departmentFilter) &&
          (levelFilter === "all" || position.level_id === levelFilter) &&
          includesSearch([position.code, position.title, position.department_name, position.level_name, position.description], search)
      ),
    [departmentFilter, levelFilter, positions, search, statusFilter]
  );

  async function saveCompany() {
    if (!token || !canManage) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveCompany(token, companyForm, Boolean(company));
      setCompany(result.company);
      setCompanyForm(companyToInput(result.company));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save company profile.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(kind: EntityKind, id: string, active: boolean) {
    if (!token || !canManage) {
      return;
    }
    const action = active ? "disable" : "enable";
    setError(null);
    try {
      if (kind === "location") {
        await api.locationAction(token, id, action);
      } else if (kind === "department") {
        await api.departmentAction(token, id, action);
      } else if (kind === "job-level") {
        await api.jobLevelAction(token, id, action);
      } else {
        await api.positionAction(token, id, action);
      }
      setActionTarget(null);
      await loadOrganization();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to ${action} record.`);
    }
  }

  async function saveModal(input: LocationInput | DepartmentInput | JobLevelInput | PositionInput) {
    if (!token || !modal || !canManage) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (modal.kind === "location") {
        modal.mode === "create"
          ? await api.createLocation(token, input as LocationInput)
          : await api.updateLocation(token, modal.record?.id ?? "", input as LocationInput);
      } else if (modal.kind === "department") {
        modal.mode === "create"
          ? await api.createDepartment(token, input as DepartmentInput)
          : await api.updateDepartment(token, modal.record?.id ?? "", input as DepartmentInput);
      } else if (modal.kind === "job-level") {
        modal.mode === "create"
          ? await api.createJobLevel(token, input as JobLevelInput)
          : await api.updateJobLevel(token, modal.record?.id ?? "", input as JobLevelInput);
      } else {
        modal.mode === "create"
          ? await api.createPosition(token, input as PositionInput)
          : await api.updatePosition(token, modal.record?.id ?? "", input as PositionInput);
      }
      setModal(null);
      await loadOrganization();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save record.");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return <PermissionFallback />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Organization Settings</h1>
          <p className="text-sm text-muted-foreground">Company structure and master data used by future employee profiles.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadOrganization()}>
          <RotateCcw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Panel className="overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={cn(
                "h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium text-muted-foreground",
                activeTab === tab.key ? "border-primary text-foreground" : "border-transparent hover:bg-muted/50"
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <EmptyState title="Loading organization settings" description="Fetching company, locations, departments, positions, and levels." />
        ) : (
          <div className="p-4">
            {activeTab === "company" ? (
              <CompanyProfile
                canManage={canManage}
                company={company}
                form={companyForm}
                saving={saving}
                onChange={setCompanyForm}
                onReset={() => setCompanyForm(company ? companyToInput(company) : emptyCompany)}
                onSave={() => void saveCompany()}
              />
            ) : null}

            {activeTab === "locations" ? (
              <LocationsTab
                canManage={canManage}
                locations={filteredLocations}
                search={search}
                statusFilter={statusFilter}
                typeFilter={locationTypeFilter}
                onSearch={setSearch}
                onStatus={setStatusFilter}
                onType={setLocationTypeFilter}
                onCreate={() => setModal({ kind: "location", mode: "create" })}
                onView={(record) => setModal({ kind: "location", mode: "view", record })}
                onEdit={(record) => setModal({ kind: "location", mode: "edit", record })}
                onAction={(record) => setActionTarget({ kind: "location", id: record.id, active: record.is_active, name: record.name })}
              />
            ) : null}

            {activeTab === "departments" ? (
              <DepartmentsTab
                canManage={canManage}
                departments={filteredDepartments}
                search={search}
                statusFilter={statusFilter}
                onSearch={setSearch}
                onStatus={setStatusFilter}
                onCreate={() => setModal({ kind: "department", mode: "create" })}
                onView={(record) => setModal({ kind: "department", mode: "view", record })}
                onEdit={(record) => setModal({ kind: "department", mode: "edit", record })}
                onAction={(record) => setActionTarget({ kind: "department", id: record.id, active: record.is_active, name: record.name })}
              />
            ) : null}

            {activeTab === "positions" ? (
              <PositionsTab
                canManage={canManage}
                positions={filteredPositions}
                departments={departments.filter((department) => department.is_active)}
                jobLevels={jobLevels.filter((level) => level.is_active)}
                search={search}
                statusFilter={statusFilter}
                departmentFilter={departmentFilter}
                levelFilter={levelFilter}
                onSearch={setSearch}
                onStatus={setStatusFilter}
                onDepartment={setDepartmentFilter}
                onLevel={setLevelFilter}
                onCreate={() => setModal({ kind: "position", mode: "create" })}
                onView={(record) => setModal({ kind: "position", mode: "view", record })}
                onEdit={(record) => setModal({ kind: "position", mode: "edit", record })}
                onAction={(record) => setActionTarget({ kind: "position", id: record.id, active: record.is_active, name: record.title })}
              />
            ) : null}

            {activeTab === "job-levels" ? (
              <JobLevelsTab
                canManage={canManage}
                jobLevels={filteredJobLevels}
                search={search}
                statusFilter={statusFilter}
                onSearch={setSearch}
                onStatus={setStatusFilter}
                onCreate={() => setModal({ kind: "job-level", mode: "create" })}
                onView={(record) => setModal({ kind: "job-level", mode: "view", record })}
                onEdit={(record) => setModal({ kind: "job-level", mode: "edit", record })}
                onAction={(record) => setActionTarget({ kind: "job-level", id: record.id, active: record.is_active, name: record.name })}
              />
            ) : null}
          </div>
        )}
      </Panel>

      {modal ? (
        <OrganizationModal
          modal={modal}
          departments={departments.filter((department) => department.is_active && department.id !== modal.record?.id)}
          jobLevels={jobLevels.filter((level) => level.is_active)}
          saving={saving}
          canManage={canManage}
          onClose={() => setModal(null)}
          onSave={(input) => void saveModal(input)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(actionTarget)}
        title={`${actionTarget?.active ? "Disable" : "Enable"} organization record`}
        description={`Are you sure you want to ${actionTarget?.active ? "disable" : "enable"} ${actionTarget?.name ?? "this record"}?`}
        confirmLabel={actionTarget?.active ? "Disable" : "Enable"}
        tone={actionTarget?.active ? "danger" : "default"}
        onCancel={() => setActionTarget(null)}
        onConfirm={() => actionTarget ? void runAction(actionTarget.kind, actionTarget.id, actionTarget.active) : undefined}
      />
    </div>
  );
}

function companyToInput(company: OrganizationCompany): CompanyInput {
  return {
    name: company.name,
    legal_name: company.legal_name ?? "",
    registration_no: company.registration_no ?? "",
    tax_no: company.tax_no ?? "",
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    status: company.status
  };
}

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={label ? "space-y-1.5" : ""}>
      {label ? <Label>{label}</Label> : null}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

function SearchFilter({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  return (
    <div className="relative min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Search records" value={search} onChange={(event) => onSearch(event.target.value)} />
    </div>
  );
}

function StatusFilterSelect({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  return (
    <SelectField value={value} onChange={(next) => onChange(next as StatusFilter)}>
      <option value="all">All status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </SelectField>
  );
}

function SectionToolbar({
  canManage,
  title,
  search,
  statusFilter,
  onSearch,
  onStatus,
  onCreate,
  children
}: {
  canManage: boolean;
  title: string;
  search: string;
  statusFilter: StatusFilter;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onCreate: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">Lower rank order means the lower level in the organization hierarchy.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchFilter search={search} onSearch={onSearch} />
        <StatusFilterSelect value={statusFilter} onChange={onStatus} />
        {children}
        {canManage ? (
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CompanyProfile({
  canManage,
  company,
  form,
  saving,
  onChange,
  onReset,
  onSave
}: {
  canManage: boolean;
  company: OrganizationCompany | null;
  form: CompanyInput;
  saving: boolean;
  onChange: (value: CompanyInput) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Company profile</h2>
            <p className="text-xs text-muted-foreground">Logo/document linkage is reserved for the future document module.</p>
          </div>
        </div>
        {company ? <CompanyStatusBadge status={company.status} /> : <Badge tone="warning">Not created</Badge>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Company name" value={form.name} disabled={!canManage} onChange={(name) => onChange({ ...form, name })} />
        <Field label="Legal name" value={form.legal_name ?? ""} disabled={!canManage} onChange={(legal_name) => onChange({ ...form, legal_name })} />
        <Field
          label="Registration number"
          value={form.registration_no ?? ""}
          disabled={!canManage}
          onChange={(registration_no) => onChange({ ...form, registration_no })}
        />
        <Field label="Tax number" value={form.tax_no ?? ""} disabled={!canManage} onChange={(tax_no) => onChange({ ...form, tax_no })} />
        <Field label="Phone" value={form.phone ?? ""} disabled={!canManage} onChange={(phone) => onChange({ ...form, phone })} />
        <Field label="Email" value={form.email ?? ""} disabled={!canManage} onChange={(email) => onChange({ ...form, email })} />
        <div className="lg:col-span-2">
          <Field label="Address" value={form.address ?? ""} disabled={!canManage} onChange={(address) => onChange({ ...form, address })} />
        </div>
        <SelectField label="Status" value={form.status} disabled={!canManage} onChange={(status) => onChange({ ...form, status: status as CompanyInput["status"] })}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </SelectField>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">Last updated: {formatDate(company?.updated_at ?? null)}</p>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReset}>
              Reset
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RowActions({
  canManage,
  active,
  onView,
  onEdit,
  onAction
}: {
  canManage: boolean;
  active: boolean;
  onView: () => void;
  onEdit: () => void;
  onAction: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" title="View" onClick={onView}>
        <Eye className="h-4 w-4" />
      </Button>
      {canManage ? (
        <>
          <Button variant="ghost" size="icon" title="Edit" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title={active ? "Disable" : "Enable"} onClick={onAction}>
            {active ? <ToggleRight className="h-4 w-4 text-emerald-700" /> : <ToggleLeft className="h-4 w-4" />}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function LocationsTab(props: {
  canManage: boolean;
  locations: OrganizationLocation[];
  search: string;
  statusFilter: StatusFilter;
  typeFilter: "all" | LocationType;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onType: (value: "all" | LocationType) => void;
  onCreate: () => void;
  onView: (record: OrganizationLocation) => void;
  onEdit: (record: OrganizationLocation) => void;
  onAction: (record: OrganizationLocation) => void;
}) {
  return (
    <>
      <SectionToolbar {...props} title="Outlets / Locations">
        <SelectField value={props.typeFilter} onChange={(value) => props.onType(value as "all" | LocationType)}>
          <option value="all">All types</option>
          {locationTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
      </SectionToolbar>
      <TableWrap empty={!props.locations.length} emptyTitle="No locations found">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Island/City</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-mono text-xs">{location.code}</TableCell>
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell>{location.type}</TableCell>
                <TableCell>{location.island_city ?? "-"}</TableCell>
                <TableCell className="max-w-[260px] truncate">{location.address ?? "-"}</TableCell>
                <TableCell>{location.phone ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge active={location.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions canManage={props.canManage} active={location.is_active} onView={() => props.onView(location)} onEdit={() => props.onEdit(location)} onAction={() => props.onAction(location)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function DepartmentsTab(props: {
  canManage: boolean;
  departments: OrganizationDepartment[];
  search: string;
  statusFilter: StatusFilter;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onCreate: () => void;
  onView: (record: OrganizationDepartment) => void;
  onEdit: (record: OrganizationDepartment) => void;
  onAction: (record: OrganizationDepartment) => void;
}) {
  return (
    <>
      <SectionToolbar {...props} title="Departments" />
      <TableWrap empty={!props.departments.length} emptyTitle="No departments found">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Parent department</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.departments.map((department) => (
              <TableRow key={department.id}>
                <TableCell className="font-mono text-xs">{department.code}</TableCell>
                <TableCell className="font-medium">{department.name}</TableCell>
                <TableCell>{department.parent_department_name ?? "-"}</TableCell>
                <TableCell className="max-w-[360px] truncate">{department.description ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge active={department.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions canManage={props.canManage} active={department.is_active} onView={() => props.onView(department)} onEdit={() => props.onEdit(department)} onAction={() => props.onAction(department)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function JobLevelsTab(props: {
  canManage: boolean;
  jobLevels: OrganizationJobLevel[];
  search: string;
  statusFilter: StatusFilter;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onCreate: () => void;
  onView: (record: OrganizationJobLevel) => void;
  onEdit: (record: OrganizationJobLevel) => void;
  onAction: (record: OrganizationJobLevel) => void;
}) {
  return (
    <>
      <SectionToolbar {...props} title="Job Levels" />
      <TableWrap empty={!props.jobLevels.length} emptyTitle="No job levels found">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Rank order</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.jobLevels.map((level) => (
              <TableRow key={level.id}>
                <TableCell className="font-mono text-xs">{level.code}</TableCell>
                <TableCell className="font-medium">{level.name}</TableCell>
                <TableCell>{level.rank_order}</TableCell>
                <TableCell className="max-w-[360px] truncate">{level.description ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge active={level.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions canManage={props.canManage} active={level.is_active} onView={() => props.onView(level)} onEdit={() => props.onEdit(level)} onAction={() => props.onAction(level)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function PositionsTab(props: {
  canManage: boolean;
  positions: OrganizationPosition[];
  departments: OrganizationDepartment[];
  jobLevels: OrganizationJobLevel[];
  search: string;
  statusFilter: StatusFilter;
  departmentFilter: string;
  levelFilter: string;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onDepartment: (value: string) => void;
  onLevel: (value: string) => void;
  onCreate: () => void;
  onView: (record: OrganizationPosition) => void;
  onEdit: (record: OrganizationPosition) => void;
  onAction: (record: OrganizationPosition) => void;
}) {
  return (
    <>
      <SectionToolbar {...props} title="Positions / Designations">
        <SelectField value={props.departmentFilter} onChange={props.onDepartment}>
          <option value="all">All departments</option>
          {props.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </SelectField>
        <SelectField value={props.levelFilter} onChange={props.onLevel}>
          <option value="all">All levels</option>
          {props.jobLevels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </SelectField>
      </SectionToolbar>
      <TableWrap empty={!props.positions.length} emptyTitle="No positions found">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Job level</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-mono text-xs">{position.code}</TableCell>
                <TableCell className="font-medium">{position.title}</TableCell>
                <TableCell>{position.department_name ?? "-"}</TableCell>
                <TableCell>{position.level_name ?? "-"}</TableCell>
                <TableCell className="max-w-[360px] truncate">{position.description ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge active={position.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions canManage={props.canManage} active={position.is_active} onView={() => props.onView(position)} onEdit={() => props.onEdit(position)} onAction={() => props.onAction(position)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function TableWrap({ empty, emptyTitle, children }: { empty: boolean; emptyTitle: string; children: ReactNode }) {
  if (empty) {
    return <EmptyState title={emptyTitle} description="Adjust filters or create a new record when you have access." />;
  }
  return <div className="overflow-x-auto rounded-md border">{children}</div>;
}

function OrganizationModal({
  modal,
  departments,
  jobLevels,
  saving,
  canManage,
  onClose,
  onSave
}: {
  modal: ModalState;
  departments: OrganizationDepartment[];
  jobLevels: OrganizationJobLevel[];
  saving: boolean;
  canManage: boolean;
  onClose: () => void;
  onSave: (input: LocationInput | DepartmentInput | JobLevelInput | PositionInput) => void;
}) {
  const readOnly = modal.mode === "view" || !canManage;
  const [form, setForm] = useState<Record<string, string>>(() => modalToForm(modal));
  const title = `${modal.mode === "create" ? "New" : modal.mode === "edit" ? "Edit" : "View"} ${modal.kind.replace("-", " ")}`;

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    if (modal.kind === "location") {
      onSave({
        code: form.code ?? "",
        name: form.name ?? "",
        type: (form.type || "OUTLET") as LocationType,
        island_city: form.island_city || null,
        address: form.address || null,
        phone: form.phone || null
      });
    } else if (modal.kind === "department") {
      onSave({
        code: form.code ?? "",
        name: form.name ?? "",
        parent_department_id: form.parent_department_id || null,
        description: form.description || null
      });
    } else if (modal.kind === "job-level") {
      onSave({
        code: form.code ?? "",
        name: form.name ?? "",
        rank_order: Number(form.rank_order),
        description: form.description || null
      });
    } else {
      onSave({
        code: form.code ?? "",
        title: form.title ?? "",
        department_id: form.department_id || null,
        level_id: form.level_id || null,
        description: form.description || null
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold capitalize">{title}</h2>
            <p className="text-xs text-muted-foreground">Organization master data record.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {modal.kind === "location" ? (
            <>
              <Field label="Code" value={form.code ?? ""} disabled={readOnly} onChange={(value) => update("code", value)} />
              <Field label="Name" value={form.name ?? ""} disabled={readOnly} onChange={(value) => update("name", value)} />
              <SelectField label="Type" value={form.type ?? "OUTLET"} disabled={readOnly} onChange={(value) => update("type", value)}>
                {locationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SelectField>
              <Field label="Island/City" value={form.island_city ?? ""} disabled={readOnly} onChange={(value) => update("island_city", value)} />
              <Field label="Address" value={form.address ?? ""} disabled={readOnly} onChange={(value) => update("address", value)} />
              <Field label="Phone" value={form.phone ?? ""} disabled={readOnly} onChange={(value) => update("phone", value)} />
            </>
          ) : null}

          {modal.kind === "department" ? (
            <>
              <Field label="Code" value={form.code ?? ""} disabled={readOnly} onChange={(value) => update("code", value)} />
              <Field label="Name" value={form.name ?? ""} disabled={readOnly} onChange={(value) => update("name", value)} />
              <SelectField label="Parent department" value={form.parent_department_id ?? ""} disabled={readOnly} onChange={(value) => update("parent_department_id", value)}>
                <option value="">None</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Description" value={form.description ?? ""} disabled={readOnly} onChange={(value) => update("description", value)} />
            </>
          ) : null}

          {modal.kind === "job-level" ? (
            <>
              <Field label="Code" value={form.code ?? ""} disabled={readOnly} onChange={(value) => update("code", value)} />
              <Field label="Name" value={form.name ?? ""} disabled={readOnly} onChange={(value) => update("name", value)} />
              <Field label="Rank order" value={form.rank_order ?? ""} disabled={readOnly} onChange={(value) => update("rank_order", value)} />
              <Field label="Description" value={form.description ?? ""} disabled={readOnly} onChange={(value) => update("description", value)} />
            </>
          ) : null}

          {modal.kind === "position" ? (
            <>
              <Field label="Code" value={form.code ?? ""} disabled={readOnly} onChange={(value) => update("code", value)} />
              <Field label="Title" value={form.title ?? ""} disabled={readOnly} onChange={(value) => update("title", value)} />
              <SelectField label="Department" value={form.department_id ?? ""} disabled={readOnly} onChange={(value) => update("department_id", value)}>
                <option value="">None</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Job level" value={form.level_id ?? ""} disabled={readOnly} onChange={(value) => update("level_id", value)}>
                <option value="">None</option>
                {jobLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </SelectField>
              <div className="md:col-span-2">
                <Field label="Description" value={form.description ?? ""} disabled={readOnly} onChange={(value) => update("description", value)} />
              </div>
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {!readOnly ? (
            <Button size="sm" onClick={submit} disabled={saving}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function modalToForm(modal: ModalState): Record<string, string> {
  const record = modal.record;
  if (!record) {
    if (modal.kind === "location") {
      return { code: "", name: "", type: "OUTLET", island_city: "", address: "", phone: "" };
    }
    if (modal.kind === "department") {
      return { code: "", name: "", parent_department_id: "", description: "" };
    }
    if (modal.kind === "job-level") {
      return { code: "", name: "", rank_order: "", description: "" };
    }
    return { code: "", title: "", department_id: "", level_id: "", description: "" };
  }
  if (modal.kind === "location") {
    const location = record as OrganizationLocation;
    return {
      code: location.code,
      name: location.name,
      type: location.type,
      island_city: location.island_city ?? "",
      address: location.address ?? "",
      phone: location.phone ?? ""
    };
  }
  if (modal.kind === "department") {
    const department = record as OrganizationDepartment;
    return {
      code: department.code,
      name: department.name,
      parent_department_id: department.parent_department_id ?? "",
      description: department.description ?? ""
    };
  }
  if (modal.kind === "job-level") {
    const level = record as OrganizationJobLevel;
    return {
      code: level.code,
      name: level.name,
      rank_order: String(level.rank_order),
      description: level.description ?? ""
    };
  }
  const position = record as OrganizationPosition;
  return {
    code: position.code,
    title: position.title,
    department_id: position.department_id ?? "",
    level_id: position.level_id ?? "",
    description: position.description ?? ""
  };
}
