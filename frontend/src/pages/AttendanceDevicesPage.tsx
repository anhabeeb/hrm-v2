import { Archive, Edit, Plus, Power, PowerOff, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceDeviceModal } from "../components/attendance/AttendanceDeviceModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceDevice } from "../types/attendance";
import type { OrganizationLocation } from "../types/organization";

export function AttendanceDevicesPage() {
  const { token, user } = useAuth();
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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update device.");
    }
  }

  async function archiveDevice(device: AttendanceDevice) {
    if (!token) return;
    try {
      await api.archiveAttendanceDevice(token, device.id, "Archived from device registry.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive device.");
    }
  }

  async function testDevice(device: AttendanceDevice) {
    if (!token) return;
    try {
      const result = await api.testAttendanceDeviceConnection(token, device.id);
      setError(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to test device placeholder.");
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Vendor</TableHead><TableHead>Mode</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Health</TableHead><TableHead>Last sync</TableHead><TableHead>Network</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((device) => <TableRow key={device.id}><TableCell><div className="font-medium">{device.name}</div><div className="text-xs text-muted-foreground">{device.notes ?? "-"}</div></TableCell><TableCell className="font-mono text-xs">{device.device_code}</TableCell><TableCell>{device.vendor ?? "ZKTECO"}</TableCell><TableCell>{device.device_mode ?? "CSV_IMPORT"}</TableCell><TableCell>{device.type}</TableCell><TableCell>{device.location_name ?? "-"}</TableCell><TableCell><Badge tone={device.status === "ACTIVE" ? "success" : device.status === "ARCHIVED" ? "danger" : "neutral"}>{device.status}</Badge></TableCell><TableCell><Badge tone={device.health_status === "ERROR" ? "danger" : device.health_status === "WARNING" ? "warning" : "neutral"}>{device.health_status ?? "UNKNOWN"}</Badge></TableCell><TableCell>{device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : "-"}</TableCell><TableCell>{device.ip_address ? `${device.ip_address}${device.port ? `:${device.port}` : ""}` : device.serial_number ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canTechnical ? <RowActionButton intent="hold" title="Test placeholder" onClick={() => void testDevice(device)}><Wrench className="h-4 w-4" /></RowActionButton> : null}{canManage ? <RowActionButton intent="edit" title="Edit" onClick={() => setEditing(device)}><Edit className="h-4 w-4" /></RowActionButton> : null}{canManage && device.status === "ACTIVE" ? <RowActionButton intent="disable" title="Disable" onClick={() => void action(device, "disable")}><PowerOff className="h-4 w-4 text-red-600" /></RowActionButton> : null}{canManage && device.status !== "ACTIVE" && device.status !== "ARCHIVED" ? <RowActionButton intent="enable" title="Enable" onClick={() => void action(device, "enable")}><Power className="h-4 w-4" /></RowActionButton> : null}{canArchive && device.status !== "ARCHIVED" ? <RowActionButton intent="archive" title="Archive" onClick={() => void archiveDevice(device)}><Archive className="h-4 w-4 text-red-600" /></RowActionButton> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading devices" description="Fetching device registry." /> : filtered.length === 0 ? <EmptyState title="No devices found" description="Add a device or adjust the search." /> : null}
      </Panel>
      {editing !== undefined && token ? <AttendanceDeviceModal token={token} locations={locations} device={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
    </PageShell>
  );
}
