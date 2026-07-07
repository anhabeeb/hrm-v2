import { Check, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveFilterChips, FilterResetButton, FilterSection, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { Button, RowActionButton } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { ConfirmDialog } from "../components/ui/dialogs";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";

type Row = Record<string, unknown>;

export function KycRequestsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
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
    try {
      await api.approveKycRequest(token, String(row.id), reviewNote);
      setReviewAction(null);
      setReviewNote("");
      alerts.showSuccess("KYC request approved", "Employee profile update request was approved.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to approve KYC request.";
      setError(message);
      alerts.showApiError(err, "Unable to approve KYC request.");
    }
  }

  async function reject(row: Row) {
    if (!token) return;
    if (!reviewNote.trim()) {
      const message = "Review note is required when rejecting a KYC request.";
      setError(message);
      alerts.showValidationError(message, "Review note required");
      return;
    }
    try {
      await api.rejectKycRequest(token, String(row.id), reviewNote.trim());
      setReviewAction(null);
      setReviewNote("");
      alerts.showSuccess("KYC request rejected", "Employee profile update request was rejected.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reject KYC request.";
      setError(message);
      alerts.showApiError(err, "Unable to reject KYC request.");
    }
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="KYC Update Requests"
        eyebrow="Self-service"
        description="Review employee-submitted profile update requests. Approval is review-only in this foundation."
        actions={
          <>
          <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
          </Button>
          <ExportMenu
            moduleName="KYC requests"
            rows={requests}
            columns={["employee_no", "employee_name", "section", "field_key", "status", "requested_by_name", "created_at", "reviewed_at", "review_note"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          </>
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

      <Panel className="overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <DataTableFrame loading={loading} error={error} empty={!loading && !error && !requests.length} className="border-0 bg-transparent shadow-none">
          <div className="flex flex-col gap-2">
            {requests.map((row) => {
              const actionable = String(row.status) === "SUBMITTED" || String(row.status) === "REVIEWED";
              return (
                <div
                  key={String(row.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "0.9rem 1.1rem",
                    background: "var(--v3-surface-2)",
                    border: "0.5px solid var(--v3-border)",
                    borderRadius: "var(--v3-radius-card)"
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <EmployeeIdentityCell
                      employeeName={text(row.employee_name)}
                      employeeNumber={text(row.employee_no)}
                      showMetadata={false}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[52px] text-xs text-muted-foreground">
                      <span>{text(row.section)} / {text(row.field_key)}</span>
                      <span className="text-[var(--v3-border-strong)]">&middot;</span>
                      <span className="max-w-[240px] truncate" title={requestedSummary(row.requested_value_json)}>New value: {requestedSummary(row.requested_value_json)}</span>
                      {row.reason ? <><span className="text-[var(--v3-border-strong)]">&middot;</span><span className="max-w-[220px] truncate" title={text(row.reason)}>Reason: {text(row.reason)}</span></> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[52px] text-xs text-muted-foreground">
                      <span>Requested by {text(row.requested_by_name)}</span>
                      <span className="text-[var(--v3-border-strong)]">&middot;</span>
                      <span>Created {text(row.created_at)}</span>
                      {row.reviewed_at ? <><span className="text-[var(--v3-border-strong)]">&middot;</span><span>Reviewed {text(row.reviewed_at)}</span></> : null}
                      {row.review_note ? <><span className="text-[var(--v3-border-strong)]">&middot;</span><span className="max-w-[220px] truncate" title={text(row.review_note)}>Note: {text(row.review_note)}</span></> : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={row.status} />
                    <div className="flex gap-1">
                      <RowActionButton intent="approve" title="Approve" disabled={!actionable} onClick={() => { setReviewAction({ type: "approve", row }); setReviewNote(""); }}>
                        <Check className="h-4 w-4" />
                      </RowActionButton>
                      <RowActionButton intent="disable" title="Reject" disabled={!actionable} onClick={() => { setReviewAction({ type: "reject", row }); setReviewNote(""); }}>
                        <X className="h-4 w-4" />
                      </RowActionButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
