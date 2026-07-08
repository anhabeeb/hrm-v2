import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Lock } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.setHours(0, 0, 0, 0)) / 86400000);
}
function statusTone(status: string): { tone: "success" | "danger" | "neutral" | "warning"; label: string } {
  if (status === "VALID") return { tone: "success", label: "Verified" };
  if (status === "EXPIRING_SOON") return { tone: "danger", label: "Expiring soon" };
  if (status === "EXPIRED") return { tone: "danger", label: "Expired" };
  if (status === "PENDING_REVIEW") return { tone: "warning", label: "Pending review" };
  return { tone: "neutral", label: humanizeTechnicalLabel(status) };
}

export function SelfServiceDocumentsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<Row[]>([]);
  const [uploadNote, setUploadNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [docsResult, warningsResult] = await Promise.all([
          api.getSelfServiceDocuments(token!),
          api.getSelfServiceDocumentWarnings(token!).catch(() => ({ warnings: [] as Row[] }))
        ]);
        if (cancelled) return;
        setDocuments(asRows(docsResult.documents));
        setUploadNote(text(docsResult.upload_note, ""));
        setWarnings(asRows(warningsResult.warnings));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your documents.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const documentTypes = useMemo(() => Array.from(new Set(documents.map((d) => text(d.document_type_name, "")).filter(Boolean))).sort(), [documents]);

  const filtered = documents.filter((d) => {
    const name = text(d.document_type_name, "").toLowerCase();
    const category = text(d.category_name, "").toLowerCase();
    if (search.trim() && !name.includes(search.trim().toLowerCase()) && !category.includes(search.trim().toLowerCase())) return false;
    if (typeFilter !== "ALL" && text(d.document_type_name) !== typeFilter) return false;
    if (statusFilter !== "ALL" && text(d.display_status) !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Unable to load documents" description={error} /></Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div>
          <p className="text-lg font-medium text-slate-950">My documents</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{documents.length} document{documents.length === 1 ? "" : "s"} on file{uploadNote ? ` · ${uploadNote}` : ""}</p>
        </div>

        <Panel className="flex flex-wrap items-center gap-2.5 p-3">
          <input
            className="h-8 min-w-[160px] flex-1 rounded-md border border-input bg-[#F7F7FB] px-3 text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search documents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="h-8 rounded-md border border-input bg-[#F7F7FB] px-2 text-xs text-muted-foreground outline-none" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Document type</option>
            {documentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="h-8 rounded-md border border-input bg-[#F7F7FB] px-2 text-xs text-muted-foreground outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Status</option>
            <option value="VALID">Verified</option>
            <option value="EXPIRING_SOON">Expiring soon</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </Panel>

        {warnings.length ? (
          <Panel className="flex items-center gap-2.5 border-[#F09595] bg-[#FCEBEB] p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#A32D2D]" />
            <p className="flex-1 text-xs text-[#A32D2D]">
              <strong>{warnings.length} document{warnings.length === 1 ? "" : "s"} expiring soon</strong>
              {warnings[0].expiry_date ? ` — your ${text(warnings[0].document_type_name, "document").toLowerCase()} expires in ${Math.max(daysUntil(text(warnings[0].expiry_date, "")), 0)} day(s).` : "."}
              {" "}Contact HR to renew.
            </p>
          </Panel>
        ) : null}

        {filtered.length ? (
          <div className="flex flex-col gap-2">
            {filtered.map((doc, i) => {
              const restricted = Boolean(doc.restricted);
              const { tone, label } = statusTone(text(doc.display_status));
              return (
                <Panel key={String(doc.id ?? i)} className="flex items-center gap-3 p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#F7F7FB]">
                    {restricted ? <Lock className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-[#0C447C]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-950">{restricted ? "Restricted document" : text(doc.document_type_name, "Document")}</p>
                    <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                      {restricted ? "Contact HR to view details" : [text(doc.original_filename, ""), doc.issue_date ? `Issued ${text(doc.issue_date)}` : "", doc.expiry_date ? `Expires ${text(doc.expiry_date)}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel className="p-4"><EmptyState title="No documents found" description={documents.length ? "Try adjusting your search or filters." : "No documents are on file yet."} /></Panel>
        )}
      </div>
    </PageShell>
  );
}
