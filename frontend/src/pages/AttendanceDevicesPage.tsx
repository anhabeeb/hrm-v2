import { Archive, Edit, Plus, Power, PowerOff, Search, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { AttendanceDeviceModal } from "../components/attendance/AttendanceDeviceModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
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
  const [editing, setEditing] = useState<AttendanceDevice | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const filtered = devices.filter((device) => [device.name, device.device_code, device.location_name, device.type, device.status].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));

  if (!canView) return <Panel><EmptyState title="Attendance devices unavailable" description="Your account needs attendance.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Attendance Devices</h1><p className="text-sm text-muted-foreground">Biometric, bridge, API, and manual import device registry.</p></div>
        <div className="flex flex-wrap gap-2">{canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add device</Button> : null}</div>
      </div>
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3"><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search devices" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Vendor</TableHead><TableHead>Mode</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Health</TableHead><TableHead>Last sync</TableHead><TableHead>Network</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((device) => <TableRow key={device.id}><TableCell><div className="font-medium">{device.name}</div><div className="text-xs text-muted-foreground">{device.notes ?? "-"}</div></TableCell><TableCell className="font-mono text-xs">{device.device_code}</TableCell><TableCell>{device.vendor ?? "ZKTECO"}</TableCell><TableCell>{device.device_mode ?? "CSV_IMPORT"}</TableCell><TableCell>{device.type}</TableCell><TableCell>{device.location_name ?? "-"}</TableCell><TableCell><Badge tone={device.status === "ACTIVE" ? "success" : device.status === "ARCHIVED" ? "danger" : "neutral"}>{device.status}</Badge></TableCell><TableCell><Badge tone={device.health_status === "ERROR" ? "danger" : device.health_status === "WARNING" ? "warning" : "neutral"}>{device.health_status ?? "UNKNOWN"}</Badge></TableCell><TableCell>{device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : "-"}</TableCell><TableCell>{device.ip_address ? `${device.ip_address}${device.port ? `:${device.port}` : ""}` : device.serial_number ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canTechnical ? <Button title="Test placeholder" variant="ghost" size="icon" onClick={() => void testDevice(device)}><Wrench className="h-4 w-4" /></Button> : null}{canManage ? <Button title="Edit" variant="ghost" size="icon" onClick={() => setEditing(device)}><Edit className="h-4 w-4" /></Button> : null}{canManage && device.status === "ACTIVE" ? <Button title="Disable" variant="ghost" size="icon" onClick={() => void action(device, "disable")}><PowerOff className="h-4 w-4 text-red-600" /></Button> : null}{canManage && device.status !== "ACTIVE" && device.status !== "ARCHIVED" ? <Button title="Enable" variant="ghost" size="icon" onClick={() => void action(device, "enable")}><Power className="h-4 w-4" /></Button> : null}{canArchive && device.status !== "ARCHIVED" ? <Button title="Archive" variant="ghost" size="icon" onClick={() => void archiveDevice(device)}><Archive className="h-4 w-4 text-red-600" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading devices" description="Fetching device registry." /> : filtered.length === 0 ? <EmptyState title="No devices found" description="Add a device or adjust the search." /> : null}
      </Panel>
      {editing !== undefined && token ? <AttendanceDeviceModal token={token} locations={locations} device={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
    </div>
  );
}
