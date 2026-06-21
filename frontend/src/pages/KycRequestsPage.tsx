import { Check, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type Row = Record<string, unknown>;

export function KycRequestsPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({ search, status, section, date_from: dateFrom, date_to: dateTo }), [search, status, section, dateFrom, dateTo]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listKycRequests(token, filters);
      setRequests(result.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function approve(row: Row) {
    if (!token) return;
    const note = window.prompt("Optional approval review note") ?? "";
    await api.approveKycRequest(token, String(row.id), note);
    await load();
  }

  async function reject(row: Row) {
    if (!token) return;
    const note = window.prompt("Review note is required to reject this request");
    if (!note?.trim()) {
      setError("Review note is required when rejecting a KYC request.");
      return;
    }
    await api.rejectKycRequest(token, String(row.id), note.trim());
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">KYC Update Requests</h1>
          <p className="text-sm text-muted-foreground">Review employee-submitted profile update requests. Approval is review-only in this foundation.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Panel className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_150px_150px_150px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employee, field, reason..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Status</option>
            {["SUBMITTED", "REVIEWED", "APPROVED", "REJECTED", "CANCELLED"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={section} onChange={(event) => setSection(event.target.value)}>
            <option value="">Section</option>
            {["contact", "personal", "emergency", "other"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button variant="outline" size="sm" onClick={() => void load()}>Apply</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <DataTableFrame loading={loading} error={error} empty={!loading && !error && !requests.length}>
          <Table>
            <TableHeader className="sticky top-0">
              <TableRow>
                <TableHead>Employee no</TableHead>
                <TableHead>Employee name</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Field key</TableHead>
                <TableHead>Requested value</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Reviewed</TableHead>
                <TableHead>Review note</TableHead>
                <TableHead className="sticky right-0 bg-muted text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((row) => {
                const actionable = String(row.status) === "SUBMITTED" || String(row.status) === "REVIEWED";
                return (
                  <TableRow key={String(row.id)}>
                    <TableCell className="whitespace-nowrap">{text(row.employee_no)}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{text(row.employee_name)}</TableCell>
                    <TableCell>{text(row.section)}</TableCell>
                    <TableCell>{text(row.field_key)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{requestedSummary(row.requested_value_json)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{text(row.reason)}</TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{text(row.requested_by_name)}</TableCell>
                    <TableCell className="whitespace-nowrap">{text(row.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{text(row.reviewed_at)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{text(row.review_note)}</TableCell>
                    <TableCell className="sticky right-0 bg-white text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Approve" disabled={!actionable} onClick={() => void approve(row)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Reject" disabled={!actionable} onClick={() => void reject(row)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
    </div>
  );
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function requestedSummary(value: unknown) {
  if (!value) return "-";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && "value" in parsed) return String((parsed as { value?: unknown }).value ?? "-");
    return JSON.stringify(parsed);
  } catch {
    return String(value);
  }
}
