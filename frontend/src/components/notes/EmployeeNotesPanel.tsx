import { Archive, History, Paperclip, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialogs";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import type { EmployeeNote, EmployeeNoteAttachment, EmployeeNoteCategory, EmployeeNoteVersion, NoteVisibility } from "../../types/assets";
import type { EmployeeDocument } from "../../types/documents";
import type { Employee } from "../../types/employees";

type ModalState =
  | { type: "edit"; note?: EmployeeNote }
  | { type: "versions"; note: EmployeeNote }
  | { type: "attachments"; note: EmployeeNote }
  | null;

const linkedModules = ["employee", "payroll", "leave", "attendance", "documents", "assets", "roster", "other"];

export function EmployeeNotesPanel({ employee }: { employee: Employee }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canCreate = permissions.has("employee_notes.create");
  const canUpdate = permissions.has("employee_notes.update");
  const canArchive = permissions.has("employee_notes.archive");
  const canAttach = permissions.has("employee_notes.attachments.manage");
  const canRestrictedManage = permissions.has("employee_notes.restricted.manage");
  const canRestrictedView = permissions.has("employee_notes.restricted.view");
  const [notes, setNotes] = useState<EmployeeNote[]>([]);
  const [categories, setCategories] = useState<EmployeeNoteCategory[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [filters, setFilters] = useState({ search: "", category_id: "", visibility: "", linked_module: "", include_archived: false, date_from: "", date_to: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [archiveTarget, setArchiveTarget] = useState<EmployeeNote | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [noteRows, categoryRows, documentRows] = await Promise.all([
        api.listEmployeeNotes(token, employee.id, filters),
        api.listEmployeeNoteCategories(token),
        api.listEmployeeDocuments(token, employee.id)
      ]);
      setNotes(noteRows.notes ?? []);
      setCategories(categoryRows.categories ?? []);
      setDocuments(documentRows.documents ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load notes.");
    }
  }

  useEffect(() => { void load(); }, [token, employee.id]);

  async function archive(note: EmployeeNote) {
    if (!token) return;
    try {
      await api.archiveEmployeeNote(token, employee.id, note.id, archiveReason.trim());
      setArchiveTarget(null);
      setArchiveReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive note.");
    }
  }

  const visibilityOptions = canRestrictedView || canRestrictedManage ? ["GENERAL", "HR_ONLY", "RESTRICTED"] : ["GENERAL"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h3 className="text-sm font-semibold">Restricted notes</h3><p className="text-xs text-muted-foreground">General, HR-only, and restricted notes with version history and document references.</p></div>
        {canCreate ? <Button size="sm" onClick={() => setModal({ type: "edit" })}>Add note</Button> : null}
      </div>
      <Panel className="p-3">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Input placeholder="Search notes" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Select value={filters.category_id} onChange={(category_id) => setFilters({ ...filters, category_id })} empty="All categories" options={categories.map((category) => [category.id, category.name])} />
          <Select value={filters.visibility} onChange={(visibility) => setFilters({ ...filters, visibility })} empty="All visibility" options={visibilityOptions} />
          <Select value={filters.linked_module} onChange={(linked_module) => setFilters({ ...filters, linked_module })} empty="All linked modules" options={linkedModules} />
          <Field label="Date from" type="date" value={filters.date_from} onChange={(date_from) => setFilters({ ...filters, date_from })} />
          <Field label="Date to" type="date" value={filters.date_to} onChange={(date_to) => setFilters({ ...filters, date_to })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.include_archived} onChange={(event) => setFilters({ ...filters, include_archived: event.target.checked })} /> Include archived</label>
        </div>
        <div className="mt-3 flex justify-end"><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button></div>
      </Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Note</TableHead><TableHead>Category</TableHead><TableHead>Visibility</TableHead><TableHead>Linked module</TableHead><TableHead>By</TableHead><TableHead>Updated</TableHead><TableHead>Archived</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{notes.map((note) => {
              const restricted = note.visibility === "HR_ONLY" || note.visibility === "RESTRICTED";
              return <TableRow key={note.id}><TableCell><div className="font-medium">{note.title}</div><div className="max-w-[420px] truncate text-xs text-muted-foreground">{note.note_body}</div></TableCell><TableCell>{note.category_name ?? "-"}</TableCell><TableCell><Badge tone={note.visibility === "RESTRICTED" ? "danger" : note.visibility === "HR_ONLY" ? "warning" : "neutral"}>{note.visibility}</Badge></TableCell><TableCell>{note.linked_module ?? "-"}</TableCell><TableCell>{note.created_by_name ?? "-"}</TableCell><TableCell>{note.updated_at}</TableCell><TableCell>{note.is_archived ? <Badge tone="neutral">Archived</Badge> : "-"}</TableCell><TableCell><div className="flex min-w-[260px] justify-end gap-1">{canUpdate && (!restricted || canRestrictedManage) ? <Button variant="ghost" size="icon" onClick={() => setModal({ type: "edit", note })}><Pencil className="h-4 w-4" /></Button> : null}<Button variant="ghost" size="icon" onClick={() => setModal({ type: "versions", note })}><History className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setModal({ type: "attachments", note })}><Paperclip className="h-4 w-4" /></Button>{canArchive && !note.is_archived && (!restricted || canRestrictedManage) ? <Button variant="ghost" size="icon" onClick={() => { setArchiveTarget(note); setArchiveReason(""); }}><Archive className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
          {!notes.length ? <EmptyState title="No notes yet" description="Create scoped HR notes for this employee." /> : null}
        </div>
      </Panel>
      {modal?.type === "edit" ? <NoteModal employee={employee} note={modal.note} categories={categories} canRestrictedManage={canRestrictedManage} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "versions" ? <VersionsModal employee={employee} note={modal.note} onClose={() => setModal(null)} /> : null}
      {modal?.type === "attachments" ? <AttachmentsModal employee={employee} note={modal.note} documents={documents} canAttach={canAttach && (modal.note.visibility !== "RESTRICTED" || canRestrictedManage)} onClose={() => setModal(null)} /> : null}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive employee note"
        description={`Archive ${archiveTarget?.title ?? "this note"}? The note remains in history for audit review.`}
        confirmLabel="Archive"
        tone="danger"
        requireReason
        reasonValue={archiveReason}
        onReasonChange={setArchiveReason}
        onCancel={() => { setArchiveTarget(null); setArchiveReason(""); }}
        onConfirm={() => archiveTarget ? void archive(archiveTarget) : undefined}
      />
    </div>
  );
}

function NoteModal({ employee, note, categories, canRestrictedManage, onClose, onSaved }: { employee: Employee; note?: EmployeeNote; categories: EmployeeNoteCategory[]; canRestrictedManage: boolean; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const allowedVisibility = canRestrictedManage ? ["GENERAL", "HR_ONLY", "RESTRICTED"] : ["GENERAL"];
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.note_body ?? "");
  const [categoryId, setCategoryId] = useState(note?.category_id ?? categories[0]?.id ?? "");
  const [visibility, setVisibility] = useState<NoteVisibility>((allowedVisibility.includes(note?.visibility ?? "") ? note?.visibility : "GENERAL") as NoteVisibility);
  const [linkedModule, setLinkedModule] = useState(note?.linked_module ?? "employee");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReason = Boolean(note && visibility !== "GENERAL");
  async function save() {
    if (!token) return;
    if (needsReason && !reason) {
      setError("Edit reason is required for HR-only or restricted notes.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = { title, note_body: body, category_id: categoryId || null, visibility, linked_module: linkedModule || null, edit_reason: reason || null };
      if (note) await api.updateEmployeeNote(token, employee.id, note.id, input);
      else await api.createEmployeeNote(token, employee.id, input);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save note.");
    } finally {
      setSaving(false);
    }
  }
  return <Dialog title={note ? "Edit note" : "Create note"} error={error} onClose={onClose} onSave={save} saving={saving}><Field label="Title" value={title} onChange={setTitle} /><SelectField label="Category" value={categoryId} onChange={setCategoryId} options={categories.map((category) => [category.id, category.name])} empty="No category" /><SelectField label="Visibility" value={visibility} onChange={(value) => setVisibility(value as NoteVisibility)} options={allowedVisibility.map((value) => [value, value])} /><SelectField label="Linked module" value={linkedModule} onChange={setLinkedModule} options={linkedModules.map((value) => [value, value])} /><div className="space-y-1.5 md:col-span-2"><Label>Note</Label><textarea className="min-h-28 w-full rounded-md border px-3 py-2 text-sm" value={body} onChange={(event) => setBody(event.target.value)} /></div>{note ? <Field label={needsReason ? "Edit reason *" : "Edit reason"} value={reason} onChange={setReason} /> : null}</Dialog>;
}

function VersionsModal({ employee, note, onClose }: { employee: Employee; note: EmployeeNote; onClose: () => void }) {
  const { token } = useAuth();
  const [versions, setVersions] = useState<EmployeeNoteVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (token) void api.listEmployeeNoteVersions(token, employee.id, note.id).then((result) => setVersions(result.versions ?? [])).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load versions.")); }, [token, employee.id, note.id]);
  return <ReadDialog title="Version history" onClose={onClose}>{error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<Table><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Title</TableHead><TableHead>Visibility</TableHead><TableHead>Edited by</TableHead><TableHead>Reason</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{versions.map((version) => <TableRow key={version.id}><TableCell>{version.version_no}</TableCell><TableCell>{version.title}</TableCell><TableCell><Badge tone={version.visibility === "RESTRICTED" ? "danger" : version.visibility === "HR_ONLY" ? "warning" : "neutral"}>{version.visibility}</Badge></TableCell><TableCell>{version.edited_by_name ?? "-"}</TableCell><TableCell>{version.edit_reason ?? "-"}</TableCell><TableCell>{version.created_at}</TableCell></TableRow>)}</TableBody></Table>{!versions.length ? <EmptyState title="No versions" description="Version history appears after note changes." /> : null}</ReadDialog>;
}

function AttachmentsModal({ employee, note, documents, canAttach, onClose }: { employee: Employee; note: EmployeeNote; documents: EmployeeDocument[]; canAttach: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const [attachments, setAttachments] = useState<EmployeeNoteAttachment[]>([]);
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!token) return;
    try {
      setAttachments((await api.listEmployeeNoteAttachments(token, employee.id, note.id)).attachments ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load attachments.");
    }
  }
  useEffect(() => { void load(); }, [token, employee.id, note.id]);
  async function attach() {
    if (!token) return;
    try {
      await api.attachEmployeeNoteDocument(token, employee.id, note.id, { employee_document_id: documentId, description });
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to attach document.");
    }
  }
  async function detach(attachment: EmployeeNoteAttachment) {
    if (!token) return;
    await api.detachEmployeeNoteDocument(token, employee.id, note.id, attachment.id);
    await load();
  }
  return (
    <ReadDialog title="Note attachments" onClose={onClose}>
      {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {canAttach ? (
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <SelectField
            label="Employee document"
            value={documentId}
            onChange={setDocumentId}
            options={documents.map((document) => [document.id, document.original_filename ?? document.document_number ?? document.document_type_name ?? document.id])}
          />
          <Field label="Description" value={description} onChange={setDescription} />
          <div className="flex items-end"><Button size="sm" disabled={!documentId} onClick={() => void attach()}>Attach</Button></div>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Number</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Attached by/date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attachments.map((attachment) => (
            <TableRow key={attachment.id}>
              <TableCell>{attachment.restricted ? <span className="flex items-center gap-2">Restricted document <Badge tone="warning">Restricted</Badge></span> : attachment.unavailable ? "Unavailable document" : attachment.original_filename ?? "-"}</TableCell>
              <TableCell>{attachment.restricted ? "-" : attachment.unavailable ? "-" : attachment.document_number ?? "-"}</TableCell>
              <TableCell>{attachment.restricted ? "Restricted document" : attachment.document_type_name ?? "-"}</TableCell>
              <TableCell>{attachment.description ?? "-"}</TableCell>
              <TableCell>{attachment.attached_by_name ?? "-"} / {attachment.attached_at}</TableCell>
              <TableCell className="text-right">{canAttach ? <Button variant="ghost" size="sm" onClick={() => void detach(attachment)}>Detach</Button> : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!attachments.length ? <EmptyState title="No attachments" description="Attach existing Employee Document Tracking records to this note." /> : null}
    </ReadDialog>
  );
}

function Dialog({ title, error, children, saving, onClose, onSave }: { title: string; error: string | null; children: ReactNode; saving?: boolean; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={saving} onClick={() => void onSave()}>{saving ? "Saving..." : "Save"}</Button></div></div></div>;
}

function ReadDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="overflow-auto p-4">{children}</div></div></div>;
}

function Select({ value, onChange, options, empty }: { value: string; onChange: (value: string) => void; options: Array<string | [string, string]>; empty: string }) {
  return <select className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{options.map((option) => { const id = Array.isArray(option) ? option[0] : option; const label = Array.isArray(option) ? option[1] : option; return <option key={id} value={id}>{label}</option>; })}</select>;
}

function SelectField({ label, value, onChange, options, empty }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; empty?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{empty ? <option value="">{empty}</option> : null}{options.map(([id, labelText]) => <option key={id} value={id}>{labelText}</option>)}</select></div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
