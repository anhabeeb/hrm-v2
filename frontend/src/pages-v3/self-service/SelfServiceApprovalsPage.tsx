import { useEffect, useState } from "react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["APPROVED", "COMPLETED", "RESOLVED"].includes(status)) return "success";
  if (["PENDING", "PENDING_APPROVAL", "SUBMITTED", "OPEN"].includes(status)) return "warning";
  if (["REJECTED", "DISMISSED", "CANCELLED"].includes(status)) return "danger";
  return "neutral";
}

function RequestList({ title, rows, emptyDescription, fields }: { title: string; rows: Row[]; emptyDescription: string; fields: (row: Row) => { headline: string; meta: string; status: string } }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">{title}</p></div>
      {rows.length ? (
        <div className="flex flex-col">
          {rows.map((row, i) => {
            const { headline, meta, status } = fields(row);
            return (
              <div key={String(row.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-950">{headline}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{meta}</p>
                </div>
                <Badge tone={statusTone(status)}>{humanizeTechnicalLabel(status)}</Badge>
              </div>
            );
          })}
        </div>
      ) : <div className="p-4"><EmptyState title="Nothing here yet" description={emptyDescription} /></div>}
    </Panel>
  );
}

export function SelfServiceApprovalsPage() {
  const { token } = useAuth();
  const [profileUpdates, setProfileUpdates] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [attendanceCorrections, setAttendanceCorrections] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServiceRequests(token).then((result) => {
      if (cancelled) return;
      const requests = (result.requests ?? {}) as Row;
      setProfileUpdates(asRows(requests.profile_updates));
      setLeaveRequests(asRows(requests.leave_requests));
      setAttendanceCorrections(asRows(requests.attendance_corrections));
    }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your requests."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div>
          <p className="text-lg font-medium text-slate-950">Requests &amp; approvals</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Track the status of everything you've submitted for approval</p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : (
          <>
            <RequestList
              title="Profile update requests"
              rows={profileUpdates}
              emptyDescription="Requests to change your profile details will appear here."
              fields={(row) => ({ headline: `${humanizeTechnicalLabel(text(row.section))} · ${humanizeTechnicalLabel(text(row.field_key))}`, meta: `${text(row.reason)} · ${text(row.created_at)}`, status: text(row.status) })}
            />
            <RequestList
              title="Leave requests"
              rows={leaveRequests}
              emptyDescription="Your submitted leave requests will appear here."
              fields={(row) => ({ headline: humanizeTechnicalLabel(text(row.request_type, "Leave request")), meta: `${text(row.reason)} · ${text(row.created_at)}`, status: text(row.status) })}
            />
            <RequestList
              title="Attendance correction requests"
              rows={attendanceCorrections}
              emptyDescription="Your submitted attendance corrections will appear here."
              fields={(row) => ({ headline: `Attendance ${text(row.attendance_date)}`, meta: `Requested ${humanizeTechnicalLabel(text(row.requested_status))} · ${text(row.reason)}`, status: text(row.status) })}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
