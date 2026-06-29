import { ImageUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { Employee } from "../../types/employees";
import { ActionTextButton } from "../ui/action-button";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function EmployeeProfilePhotoControls({
  employee,
  token,
  canUpload,
  canClear,
  onChanged,
  compact = false
}: {
  employee: Employee;
  token: string;
  canUpload: boolean;
  canClear: boolean;
  onChanged: () => Promise<void>;
  compact?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clearPhoto() {
    if (!employee.profile_photo_document_id) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearEmployeeProfilePhoto(token, employee.id);
      setClearOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to clear profile photo.");
    } finally {
      setClearing(false);
    }
  }

  if (!canUpload && !canClear) return null;

  return (
    <div className={compact ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      {error ? <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {canUpload ? (
        <ActionTextButton intent="upload" size="sm" onClick={() => { setError(null); setModalOpen(true); }}>
          <ImageUp className="h-4 w-4" />
          {employee.profile_photo_document_id ? "Change photo" : "Upload photo"}
        </ActionTextButton>
      ) : null}
      {canClear && employee.profile_photo_document_id ? (
        <ActionTextButton intent="delete" size="sm" loading={clearing} loadingLabel="Clearing photo" onClick={() => setClearOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Clear photo
        </ActionTextButton>
      ) : null}
      {modalOpen ? <ProfilePhotoModal employee={employee} token={token} onClose={() => setModalOpen(false)} onSaved={onChanged} /> : null}
      {clearOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold">Clear profile photo</h2>
            <p className="mt-1 text-xs text-muted-foreground">The Profile Photo document will be archived, not permanently deleted.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setClearOpen(false)}>Cancel</Button>
              <ActionTextButton intent="delete" size="sm" loading={clearing} loadingLabel="Clearing photo" onClick={() => void clearPhoto()}>Clear photo</ActionTextButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfilePhotoModal({ employee, token, onClose, onSaved }: { employee: Employee; token: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!file) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setSaving(true);
    try {
      await api.uploadEmployeeProfilePhoto(token, employee.id, form);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload profile photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{employee.profile_photo_document_id ? "Change profile photo" : "Upload profile photo"}</h2>
            <p className="text-xs text-muted-foreground">{employee.full_name} - {employee.employee_no}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label>Photo</Label>
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Maximum size follows the Profile Photo document type setting.</p>
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <ActionTextButton intent="upload" size="sm" loading={saving} loadingLabel="Saving photo" onClick={() => void submit()}>Save photo</ActionTextButton>
        </div>
      </div>
    </div>
  );
}
