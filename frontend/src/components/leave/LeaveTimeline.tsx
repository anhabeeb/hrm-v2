import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { LeaveApproval } from "../../types/leave";

function tone(status: string) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "SKIPPED") return "neutral";
  return "warning";
}

export function LeaveTimeline({ rows }: { rows: LeaveApproval[] }) {
  if (!rows.length) return <EmptyState title="No approval timeline" description="Timeline is generated when a leave request is submitted." />;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Step</TableHead><TableHead>Approver type</TableHead><TableHead>Approver</TableHead><TableHead>Status</TableHead><TableHead>Action by</TableHead><TableHead>Action at</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.step_order}</TableCell><TableCell className="font-medium">{row.step_name}</TableCell><TableCell>{row.approver_type}</TableCell><TableCell>{row.approver_name ?? row.approver_user_id ?? "-"}</TableCell><TableCell><Badge tone={tone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.action_by_name ?? "-"}</TableCell><TableCell>{row.action_at ? new Date(row.action_at).toLocaleString() : "-"}</TableCell><TableCell>{row.note ?? "-"}</TableCell></TableRow>)}</TableBody>
      </Table>
    </div>
  );
}
