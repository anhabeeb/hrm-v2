import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { AttendanceDevice, DeviceType } from "../../types/attendance";
import type { OrganizationLocation } from "../../types/organization";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CheckboxField, SelectField } from "../ui/page-shell";

const deviceTypes: DeviceType[] = ["BIOMETRIC", "MANUAL_IMPORT", "API", "BRIDGE", "PUSH_ADMS", "OTHER"];
type DeviceVendor = NonNullable<AttendanceDevice["vendor"]>;
type DeviceMode = NonNullable<AttendanceDevice["device_mode"]>;
type DirectionMode = NonNullable<AttendanceDevice["direction_mode"]>;

const vendors: DeviceVendor[] = ["ZKTECO", "ZKTIME", "ZKBIO_TIME", "MANUAL_IMPORT", "GENERIC_API", "OTHER"];
const deviceModes: DeviceMode[] = ["CSV_IMPORT", "LOCAL_BRIDGE", "PUSH_ADMS", "API_PLACEHOLDER", "MANUAL"];
const directionModes: DirectionMode[] = ["IN_OUT", "AUTO_PAIR", "PUNCH_STATE", "UNKNOWN"];

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
  const [vendor, setVendor] = useState<DeviceVendor>(props.device?.vendor ?? "ZKTECO");
  const [model, setModel] = useState(props.device?.model ?? "");
  const [type, setType] = useState<DeviceType>(props.device?.type ?? "BIOMETRIC");
  const [ipAddress, setIpAddress] = useState(props.device?.ip_address ?? "");
  const [port, setPort] = useState(props.device?.port ? String(props.device.port) : "");
  const [serialNumber, setSerialNumber] = useState(props.device?.serial_number ?? "");
  const [timezone, setTimezone] = useState(props.device?.timezone ?? "");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(props.device?.device_mode ?? "CSV_IMPORT");
  const [directionMode, setDirectionMode] = useState<DirectionMode>(props.device?.direction_mode ?? "IN_OUT");
  const [externalDeviceId, setExternalDeviceId] = useState(props.device?.external_device_id ?? "");
  const [admsDeviceKey, setAdmsDeviceKey] = useState(props.device?.adms_device_key ?? "");
  const [syncEnabled, setSyncEnabled] = useState(Boolean(props.device?.sync_enabled));
  const [allowCsvImport, setAllowCsvImport] = useState(Boolean(props.device?.allow_csv_import ?? true));
  const [allowBridgeImport, setAllowBridgeImport] = useState(Boolean(props.device?.allow_bridge_import));
  const [allowPushAdms, setAllowPushAdms] = useState(Boolean(props.device?.allow_push_adms));
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
        vendor,
        model: model || null,
        type,
        ip_address: ipAddress || null,
        port: port ? Number(port) : null,
        serial_number: serialNumber || null,
        timezone: timezone || null,
        device_mode: deviceMode,
        direction_mode: directionMode,
        external_device_id: externalDeviceId || null,
        adms_device_key: admsDeviceKey || null,
        sync_enabled: syncEnabled,
        allow_csv_import: allowCsvImport,
        allow_bridge_import: allowBridgeImport,
        allow_push_adms: allowPushAdms,
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
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">
          {error ? <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Device code"><Input value={deviceCode} onChange={(event) => setDeviceCode(event.target.value)} required /></Field>
          <Field label="Vendor">
            <SelectField value={vendor} onValueChange={(value) => setVendor(value as DeviceVendor)}>
              {vendors.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Model"><Input value={model} onChange={(event) => setModel(event.target.value)} /></Field>
          <Field label="Type">
            <SelectField value={type} onValueChange={(value) => setType(value as DeviceType)}>
              {deviceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Device mode">
            <SelectField value={deviceMode} onValueChange={(value) => setDeviceMode(value as DeviceMode)}>
              {deviceModes.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Direction mode">
            <SelectField value={directionMode} onValueChange={(value) => setDirectionMode(value as DirectionMode)}>
              {directionModes.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
          </Field>
          <Field label="Location">
            <SelectField value={locationId} onValueChange={setLocationId}>
              <option value="">No location</option>
              {props.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </SelectField>
          </Field>
          <Field label="IP address"><Input value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} /></Field>
          <Field label="Port"><Input type="number" min="1" value={port} onChange={(event) => setPort(event.target.value)} /></Field>
          <Field label="Serial number"><Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></Field>
          <Field label="Timezone"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Indian/Maldives" /></Field>
          <Field label="External device ID"><Input value={externalDeviceId} onChange={(event) => setExternalDeviceId(event.target.value)} /></Field>
          <Field label="ADMS device key"><Input value={admsDeviceKey} onChange={(event) => setAdmsDeviceKey(event.target.value)} /></Field>
          <div className="grid gap-2 rounded-md border p-3 text-sm md:col-span-2">
            <CheckboxField label="Sync enabled placeholder" checked={syncEnabled} onChange={setSyncEnabled} />
            <CheckboxField label="Allow CSV import" checked={allowCsvImport} onChange={setAllowCsvImport} />
            <CheckboxField label="Allow local bridge ingestion" checked={allowBridgeImport} onChange={setAllowBridgeImport} />
            <CheckboxField label="Allow ADMS push placeholder" checked={allowPushAdms} onChange={setAllowPushAdms} />
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button type="submit" loading={saving} loadingLabel="Saving attendance device">Save device</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
