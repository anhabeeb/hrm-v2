import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { AttendanceDevice, DeviceType } from "../../types/attendance";
import type { OrganizationLocation } from "../../types/organization";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const deviceTypes: DeviceType[] = ["BIOMETRIC", "MANUAL_IMPORT", "API", "BRIDGE", "OTHER"];

export function AttendanceDeviceModal(props: {
  token: string;
  locations: OrganizationLocation[];
  device?: AttendanceDevice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(props.device?.name ?? "");
  const [deviceCode, setDeviceCode] = useState(props.device?.device_code ?? "");
  const [locationId, setLocationId] = useState(props.device?.location_id ?? "");
  const [type, setType] = useState<DeviceType>(props.device?.type ?? "BIOMETRIC");
  const [ipAddress, setIpAddress] = useState(props.device?.ip_address ?? "");
  const [serialNumber, setSerialNumber] = useState(props.device?.serial_number ?? "");
  const [notes, setNotes] = useState(props.device?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: Partial<AttendanceDevice> = {
        name,
        device_code: deviceCode,
        location_id: locationId || null,
        type,
        ip_address: ipAddress || null,
        serial_number: serialNumber || null,
        notes: notes || null
      };
      if (props.device) await api.updateAttendanceDevice(props.token, props.device.id, input);
      else await api.createAttendanceDevice(props.token, input);
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save device.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">{props.device ? "Edit Attendance Device" : "Add Attendance Device"}</h2>
          <p className="text-sm text-muted-foreground">Device setup is ready for imports, API bridges, and future live sync.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Device code"><Input value={deviceCode} onChange={(event) => setDeviceCode(event.target.value)} required /></Field>
          <Field label="Type">
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as DeviceType)}>
              {deviceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">No location</option>
              {props.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </Field>
          <Field label="IP address"><Input value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} /></Field>
          <Field label="Serial number"><Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></Field>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save device"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
