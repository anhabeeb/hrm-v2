import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AttendanceDeviceModal } from "../components/attendance/AttendanceDeviceModal";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { ATTENDANCE_NAV_ITEMS } from "./attendanceNav";
import type { AttendanceDevice } from "../types/attendance";
import type { OrganizationLocation } from "../types/organization";

export function AttendanceDevicesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("attendance.devices.manage") || permissions.has("attendance.devices.update");
  const canArchive = permissions.has("attendance.devices.archive") || permissions.has("attendance.devices.manage");
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AttendanceDevice | null | undefined>(undefined);

  async function load() {
    if (!token) return;
    setLoading(true);
    const [deviceResult, locationResult] = await Promise.all([api.listAttendanceDevices(token), api.listLocations(token)]);
    setDevices(deviceResult.devices);
    setLocations(locationResult.locations);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = devices.filter((d) => !search || [d.name, d.device_code, d.location_name, d.type].some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase())));

  async function toggle(device: AttendanceDevice) {
    if (!token) return;
    try {
      await api.attendanceDeviceAction(token, device.id, device.status === "ACTIVE" ? "disable" : "enable");
      alerts.showSuccess("Device updated", `${device.name} was ${device.status === "ACTIVE" ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update device.");
    }
  }

  async function archive(device: AttendanceDevice) {
    if (!token) return;
    try {
      await api.archiveAttendanceDevice(token, device.id, "Archived from device registry.");
      alerts.showSuccess("Device archived", `${device.name} was archived.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to archive device.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ATTENDANCE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Devices</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Biometric, bridge, API, and manual import device registry</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add device</Button> : null}
          </div>

          <Input className="h-8 w-64 text-xs" placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((device) => (
                <Panel key={device.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{device.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{device.device_code} · {device.vendor ?? "ZKTECO"} · {device.device_mode ?? "CSV_IMPORT"} · {device.type}{device.location_name ? ` · ${device.location_name}` : ""}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{device.ip_address ? `${device.ip_address}${device.port ? `:${device.port}` : ""}` : device.serial_number ?? "No network info"}{device.last_sync_at ? ` · Synced ${new Date(device.last_sync_at).toLocaleString()}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: device.status === "ACTIVE" ? "#EAF3DE" : device.status === "ARCHIVED" ? "#FCEBEB" : "#F7F7FB", color: device.status === "ACTIVE" ? "#27500A" : device.status === "ARCHIVED" ? "#A32D2D" : "#6B6F86" }}>{device.status}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: device.health_status === "ERROR" ? "#FCEBEB" : device.health_status === "WARNING" ? "#FAEEDA" : "#F7F7FB", color: device.health_status === "ERROR" ? "#A32D2D" : device.health_status === "WARNING" ? "#854F0B" : "#6B6F86" }}>{humanizeTechnicalLabel(device.health_status ?? "UNKNOWN")}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditing(device)}>Edit</Button>
                      {device.status === "ACTIVE" ? <Button size="sm" variant="danger" onClick={() => void toggle(device)}>Disable</Button> : device.status !== "ARCHIVED" ? <Button size="sm" onClick={() => void toggle(device)}>Enable</Button> : null}
                      {canArchive && device.status !== "ARCHIVED" ? <Button size="sm" variant="danger" onClick={() => void archive(device)}>Archive</Button> : null}
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No devices found" description="Add a device or adjust the search." /></Panel>
          )}
        </div>
      </div>

      {editing !== undefined && token ? <AttendanceDeviceModal token={token} locations={locations} device={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
    </PageShell>
  );
}
