import { Check, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveFilterChips, FilterResetButton, FilterSection, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Button, RowActionButton } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { ConfirmDialog } from "../components/ui/dialogs";
import { PageHeader, PageShell } from "../components/ui/page-shell";
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
  const [reviewAction, setReviewAction] = useState<{ type: "approve" | "reject"; row: Row } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const filters = useMemo(() => ({ search, status, section, date_from: dateFrom, date_to: dateTo }), [search, status, section, dateFrom, dateTo]);
  const dateRange = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(section ? [{ key: "section", label: "Section", value: section, onRemove: () => setSection("") }] : []),
    ...(dateFrom || dateTo ? [{ key: "date", label: "Request Date", value: formatDateRangeLabel(dateRange), onRemove: () => { setDateFrom(""); setDateTo(""); } }] : [])
  ], [dateFrom, dateRange, dateTo, search, section, status]);

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
    await api.approveKycRequest(token, String(row.id), reviewNote);
    setReviewAction(null);
    setReviewNote("");
    await load();
  }

  async function reject(row: Row) {
    if (!token) return;
    if (!reviewNote.trim()) {
      setError("Review note is required when rejecting a KYC request.");
      return;
    }
    await api.rejectKycRequest(token, String(row.id), reviewNote.trim());
    setReviewAction(null);
    setReviewNote("");
    await load();
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="KYC Update Requests"
        eyebrow="Self-service"
        description="Review employee-submitted profile update requests. Approval is review-only in this foundation."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
          </Button>
        }
      />

      <Panel className="p-3">
        <StandardFilterBar
          search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee, field, reason..." />}
          reset={<FilterResetButton onReset={() => { setSearch(""); setStatus(""); setSection(""); setDateFrom(""); setDateTo(""); }} />}
          actions={<Button variant="outline" size="sm" onClick={() => void load()}>Apply</Button>}
        >
          <StandardDateRangeFilter value={dateRange} onChange={(range) => { setDateFrom(range.from ?? ""); setDateTo(range.to ?? ""); }} label="Request Date Range" />
          <MoreFiltersSheet title="KYC request filters" onReset={() => { setStatus(""); setSection(""); }}>
            <FilterSection title="Request">
              <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="Status" width="status" options={["SUBMITTED", "REVIEWED", "APPROVED", "REJECTED", "CANCELLED"].map((item) => ({ value: item, label: item }))} />
              <StandardSelectFilter value={section} onValueChange={setSection} allLabel="Section" width="status" options={["contact", "personal", "emergency", "other"].map((item) => ({ value: item, label: item }))} />
            </FilterSection>
          </MoreFiltersSheet>
        </StandardFilterBar>
        <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
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
                        <RowActionButton intent="approve" title="Approve" disabled={!actionable} onClick={() => { setReviewAction({ type: "approve", row }); setReviewNote(""); }}>
                          <Check className="h-4 w-4" />
                        </RowActionButton>
                        <RowActionButton intent="disable" title="Reject" disabled={!actionable} onClick={() => { setReviewAction({ type: "reject", row }); setReviewNote(""); }}>
                          <X className="h-4 w-4" />
                        </RowActionButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
      <ConfirmDialog
        open={Boolean(reviewAction)}
        title={reviewAction?.type === "reject" ? "Reject profile update" : "Approve profile update"}
        description={reviewAction?.type === "reject" ? "Add the rejection note that will be stored with this request." : "Add an optional approval note for audit history."}
        confirmLabel={reviewAction?.type === "reject" ? "Reject" : "Approve"}
        tone={reviewAction?.type === "reject" ? "danger" : "default"}
        requireReason={reviewAction?.type === "reject"}
        reasonLabel="Review note"
        reasonValue={reviewNote}
        onReasonChange={setReviewNote}
        onCancel={() => { setReviewAction(null); setReviewNote(""); }}
        onConfirm={() => reviewAction?.type === "reject" ? void reject(reviewAction.row) : reviewAction ? void approve(reviewAction.row) : undefined}
      />
    </PageShell>
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
