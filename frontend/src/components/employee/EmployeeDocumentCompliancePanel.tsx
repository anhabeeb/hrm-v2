import { ClipboardList, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { EmployeeDocumentCompliance } from "../../types/documents";
import type { Employee } from "../../types/employees";
import { ActionTextButton } from "../ui/action-button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

function tone(status?: string) {
  if (!status) return "neutral";
  if (["COMPLIANT", "VALID", "WAIVER_ACTIVE"].includes(status)) return "success";
  if (["EXPIRING_SOON", "URGENT_EXPIRING"].includes(status)) return "warning";
  if (["MISSING_REQUIRED", "EXPIRED_DOCUMENTS", "EXPIRED"].includes(status)) return "danger";
  return "neutral";
}

export function EmployeeDocumentCompliancePanel({ employee, token, permissions }: { employee: Employee; token: string; permissions: Set<string> }) {
  const canView = permissions.has("employees.documents.compliance.view") || permissions.has("documents.compliance.view") || permissions.has("documents.view");
  const canManage = permissions.has("employees.documents.compliance.manage") || permissions.has("documents.compliance.manage");
  const [compliance, setCompliance] = useState<EmployeeDocumentCompliance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      setCompliance((await api.getEmployeeDocumentCompliance(token, employee.id)).compliance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load document compliance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [employee.id, token, canView]);

  async function refresh() {
    try {
      await api.refreshEmployeeDocumentCompliance(token, employee.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to refresh compliance.");
    }
  }

  if (!canView) return null;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" /> Document compliance</h3>
          <p className="text-xs text-muted-foreground">Employee-specific required document status, expiry warnings, and active waivers.</p>
        </div>
        {canManage ? <ActionTextButton intent="refresh" size="sm" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> Refresh</ActionTextButton> : null}
      </div>
      {error ? <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {compliance ? (
        <div className="space-y-3 p-3">
          <div className="grid gap-2 md:grid-cols-6">
            <Summary label="Status" value={compliance.compliance_status} badge />
            <Summary label="Compliance" value={`${compliance.compliance_percent}%`} />
            <Summary label="Required" value={String(compliance.total_required_documents)} />
            <Summary label="Missing" value={String(compliance.missing_required_documents)} />
            <Summary label="Expiring" value={String(compliance.expiring_documents)} />
            <Summary label="Expired" value={String(compliance.expired_documents)} />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Document type</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Document</TableHead><TableHead>Expiry</TableHead><TableHead>Waiver / reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {compliance.required_documents.map((item) => (
                  <TableRow key={item.document_type_id}>
                    <TableCell className="font-medium">{item.restricted ? "Restricted document" : item.document_type_name}</TableCell>
                    <TableCell>{item.category_name ?? "-"}</TableCell>
                    <TableCell><Badge tone={tone(String(item.status ?? item.display_status))}>{String(item.status ?? item.display_status)}</Badge></TableCell>
                    <TableCell>{item.document?.original_filename ?? item.document?.document_number ?? "-"}</TableCell>
                    <TableCell>{item.document?.expiry_date ?? "-"}</TableCell>
                    <TableCell>{item.waiver?.waiver_reason ?? item.reason ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {compliance.required_documents.length === 0 ? <EmptyState title="No required documents" description="No active required rules matched this employee." /> : null}
          </div>
        </div>
      ) : loading ? <EmptyState title="Loading compliance" description="Checking required documents and expiry status." /> : <EmptyState title="No compliance snapshot" description="Refresh compliance to calculate this employee's document status." />}
    </Panel>
  );
}

function Summary({ label, value, badge = false }: { label: string; value: string; badge?: boolean }) {
  return <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold">{badge ? <Badge tone={tone(value)}>{value}</Badge> : value}</div></div>;
}
