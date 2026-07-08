import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function statusTone(status: string) {
  if (status === "APPROVED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "PENDING" || status === "SUBMITTED") return { bg: "#FAEEDA", text: "#854F0B" };
  if (status === "REJECTED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function SelfServiceKycPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [requests, setRequests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.listSelfServiceKycRequests(token);
      setRequests(asRows(result.requests));
    } catch (err) {
      alerts.showApiError(err, "Unable to load your KYC requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">KYC requests</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Submit a request to update your personal, contact, or emergency details</p>
          </div>
          <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New request</Button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : requests.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {requests.map((row, i) => (
                <div key={String(row.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{humanizeTechnicalLabel(text(row.section))} · {humanizeTechnicalLabel(text(row.field_key))}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.reason)} · {text(row.created_at)}{row.review_note ? ` · ${text(row.review_note)}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(text(row.status)).bg, color: statusTone(text(row.status)).text }}>{humanizeTechnicalLabel(text(row.status))}</span>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No KYC requests yet" description="Submit a request to update your profile details." /></Panel>
        )}
      </div>

      {formOpen ? <KycRequestModal onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); void load(); }} /> : null}
    </PageShell>
  );
}

function KycRequestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [section, setSection] = useState("contact");
  const [fieldKey, setFieldKey] = useState("");
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!token || !requestedValue.trim()) { setError("Requested value is required."); return; }
    setSaving(true);
    try {
      await api.createSelfServiceKycRequest(token, { section, field_key: fieldKey, requested_value: requestedValue, reason });
      alerts.showSuccess("Request submitted", "Your KYC update request was submitted for review.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to submit request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>New KYC update request</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Section</Label><SelectField value={section} onValueChange={setSection}><option value="contact">Contact</option><option value="personal">Personal</option><option value="emergency">Emergency</option><option value="other">Other</option></SelectField></div>
            <div className="space-y-1.5"><Label>Field</Label><Input value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} placeholder="e.g. phone_number" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Requested value</Label><Input value={requestedValue} onChange={(e) => setRequestedValue(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
