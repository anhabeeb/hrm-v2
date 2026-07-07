import { Archive, Edit, Plus, Power, PowerOff, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceDeviceModal } from "../components/attendance/AttendanceDeviceModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/loading";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import type { AttendanceDevice } from "../types/attendance";
import type { OrganizationLocation } from "../types/organization";

export function AttendanceDevicesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("attendance.devices.view") || permissions.has("attendance.devices.manage") || permissions.has("attendance.view");
  const canManage = permissions.has("attendance.devices.manage") || permissions.has("attendance.devices.update");
  const canArchive = permissions.has("attendance.devices.archive") || permissions.has("attendance.devices.manage");
  const canTechnical = permissions.has("attendance.devices.technical") || permissions.has("attendance.device_diagnostics.view") || permissions.has("attendance.devices.manage");
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [editing, setEditing] = useState<AttendanceDevice | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusOptions = useMemo(() => Array.from(new Set(devices.map((device) => device.status).filter(Boolean))).sort(), [devices]);
  const typeOptions = useMemo(() => Array.from(new Set(devices.map((device) => device.type).filter(Boolean))).sort(), [devices]);
  const healthOptions = useMemo(() => Array.from(new Set(devices.map((device) => device.health_status ?? "UNKNOWN").filter(Boolean))).sort(), [devices]);
  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
    setHealthFilter("");
    setLocationFilter("");
  };
  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? id;
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(statusFilter ? [{ key: "status", label: "Status", value: statusFilter.replace(/_/g, " "), title: statusFilter, onRemove: () => setStatusFilter("") }] : []),
    ...(typeFilter ? [{ key: "type", label: "Device Type", value: typeFilter.replace(/_/g, " "), title: typeFilter, onRemove: () => setTypeFilter("") }] : []),
    ...(healthFilter ? [{ key: "health", label: "Health", value: healthFilter.replace(/_/g, " "), title: healthFilter, onRemove: () => setHealthFilter("") }] : []),
    ...(locationFilter ? [{ key: "location", label: "Location", value: locationName(locationFilter), onRemove: () => setLocationFilter("") }] : [])
  ], [healthFilter, locationFilter, locations, search, statusFilter, typeFilter]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [deviceResult, locationResult] = await Promise.all([api.listAttendanceDevices(token), api.listLocations(token)]);
      setDevices(deviceResult.devices);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load attendance devices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  async function action(device: AttendanceDevice, name: "enable" | "disable") {
    if (!token) return;
    try {
      await api.attendanceDeviceAction(token, device.id, name);
      alerts.showSuccess("Device updated", `${device.name} was ${name === "enable" ? "enabled" : "disabled"}.`);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to update device.";
      setError(message);
      alerts.showApiError(err, "Unable to update device.");
    }
  }

  async function archiveDevice(device: AttendanceDevice) {
    if (!token) return;
    try {
      await api.archiveAttendanceDevice(token, device.id, "Archived from device registry.");
      alerts.showSuccess("Device archived", `${device.name} was archived.`);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to archive device.";
      setError(message);
      alerts.showApiError(err, "Unable to archive device.");
    }
  }

  async function testDevice(device: AttendanceDevice) {
    if (!token) return;
    try {
      const result = await api.testAttendanceDeviceConnection(token, device.id);
      setError(result.message);
      alerts.showInfo("Device test completed", result.message ?? "Device test placeholder completed.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to test device placeholder.";
      setError(message);
      alerts.showApiError(err, "Unable to test device placeholder.");
    }
  }

  const filtered = devices.filter((device) => {
    const matchesSearch = [device.name, device.device_code, device.location_name, device.type, device.status].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase()));
    return matchesSearch
      && (!statusFilter || device.status === statusFilter)
      && (!typeFilter || device.type === typeFilter)
      && (!healthFilter || (device.health_status ?? "UNKNOWN") === healthFilter)
      && (!locationFilter || device.location_id === locationFilter);
  });

  if (!canView) return <PageShell><Panel><EmptyState title="Attendance devices unavailable" description="Your account needs attendance.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Attendance Devices"
        description="Biometric, bridge, API, and manual import device registry."
        actions={
          <>
          <ExportMenu
            moduleName="Attendance devices"
            rows={filtered as unknown as Record<string, unknown>[]}
            columns={["name", "device_code", "vendor", "device_mode", "type", "location_name", "status", "health_status", "last_sync_at", "ip_address", "port", "serial_number"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          {canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add device</Button> : null}
          </>
        }
      />
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search devices" />}
            reset={<FilterResetButton onReset={resetFilters} />}
            moreFilters={
              <MoreFiltersSheet title="Device filters" onReset={() => { setHealthFilter(""); setLocationFilter(""); }}>
                <FilterSection title="Device metadata">
                  <StandardSelectFilter value={healthFilter} onValueChange={setHealthFilter} allLabel="All health" width="status" options={healthOptions.map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
                  <StandardSelectFilter value={locationFilter} onValueChange={setLocationFilter} allLabel="All locations" width="department" options={locations.map((location) => ({ value: location.id, label: location.name }))} />
                </FilterSection>
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={statusFilter} onValueChange={setStatusFilter} allLabel="All statuses" width="status" options={statusOptions.map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
            <StandardSelectFilter value={typeFilter} onValueChange={setTypeFilter} allLabel="All device types" width="status" options={typeOptions.map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        {loading ? <TableSkeleton rows={6} columns={7} label="Loading attendance devices" /> : filtered.length === 0 ? <EmptyState title="No devices found" description="Add a device or adjust the search." /> : (
          <div className="flex flex-col gap-2 p-3">
            {filtered.map((device) => (
              <div key={device.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.9rem 1.1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{device.name}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{device.device_code}</span>
                    <span>&middot;</span>
                    <span>{device.vendor ?? "ZKTECO"}</span>
                    <span>&middot;</span>
                    <span>{device.device_mode ?? "CSV_IMPORT"}</span>
                    <span>&middot;</span>
                    <span>{device.type}</span>
                    {device.location_name ? <><span>&middot;</span><span>{device.location_name}</span></> : null}
                    <span>&middot;</span>
                    <span>{device.ip_address ? `${device.ip_address}${device.port ? `:${device.port}` : ""}` : device.serial_number ?? "No network info"}</span>
                    {device.last_sync_at ? <><span>&middot;</span><span>Synced {new Date(device.last_sync_at).toLocaleString()}</span></> : null}
                    {device.notes ? <><span>&middot;</span><span className="max-w-64 truncate">{device.notes}</span></> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone={device.status === "ACTIVE" ? "success" : device.status === "ARCHIVED" ? "danger" : "neutral"}>{device.status}</Badge>
                  <Badge tone={device.health_status === "ERROR" ? "danger" : device.health_status === "WARNING" ? "warning" : "neutral"}>{device.health_status ?? "UNKNOWN"}</Badge>
                  {canTechnical ? <RowActionButton intent="hold" title="Test placeholder" onClick={() => void testDevice(device)}><Wrench className="h-4 w-4" /></RowActionButton> : null}
                  {canManage ? <RowActionButton intent="edit" title="Edit" onClick={() => setEditing(device)}><Edit className="h-4 w-4" /></RowActionButton> : null}
                  {canManage && device.status === "ACTIVE" ? <RowActionButton intent="disable" title="Disable" onClick={() => void action(device, "disable")}><PowerOff className="h-4 w-4 text-red-600" /></RowActionButton> : null}
                  {canManage && device.status !== "ACTIVE" && device.status !== "ARCHIVED" ? <RowActionButton intent="enable" title="Enable" onClick={() => void action(device, "enable")}><Power className="h-4 w-4" /></RowActionButton> : null}
                  {canArchive && device.status !== "ARCHIVED" ? <RowActionButton intent="archive" title="Archive" onClick={() => void archiveDevice(device)}><Archive className="h-4 w-4 text-red-600" /></RowActionButton> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {editing !== undefined && token ? <AttendanceDeviceModal token={token} locations={locations} device={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
    </PageShell>
  );
}
