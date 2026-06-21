import { Edit } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { Employee } from "../../types/employees";
import type { RosterAssignment, ShiftTemplate } from "../../types/roster";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { RosterAssignmentModal } from "./RosterAssignmentModal";

function statusTone(status: string) {
  if (status === "SCHEDULED") return "success" as const;
  if (status === "LEAVE" || status === "OFF") return "info" as const;
  if (status === "ABSENT_PLACEHOLDER") return "warning" as const;
  return "neutral" as const;
}

export function EmployeeRosterPanel({ token, employee, permissions }: { token: string; employee: Employee; permissions: Set<string> }) {
  const canManage = permissions.has("roster.manage");
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [currentWeek, setCurrentWeek] = useState<{ week_start_date: string; week_end_date: string; assignments: RosterAssignment[] } | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [editing, setEditing] = useState<RosterAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [roster, current, templates] = await Promise.all([api.getEmployeeRosterSummary(token, employee.id), api.getEmployeeRosterCurrentWeek(token, employee.id), api.listShiftTemplates(token)]);
      setSummary(roster.summary);
      setAssignments(roster.assignments);
      setCurrentWeek(current);
      setHistory(roster.history);
      setShiftTemplates(templates.shift_templates.filter((template) => Boolean(template.is_active)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee roster.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, employee.id]);

  async function save(input: Partial<RosterAssignment> & { reason?: string }) {
    if (!editing?.id) return;
    try {
      await api.updateRosterAssignment(token, editing.id, input);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update assignment.");
    }
  }

  const currentRows = currentWeek?.assignments ?? [];
  const upcomingRows = assignments
    .filter((assignment) => !currentWeek || assignment.roster_date > currentWeek.week_end_date)
    .sort((a, b) => a.roster_date.localeCompare(b.roster_date))
    .slice(0, 20);
  const pastRows = assignments
    .filter((assignment) => !currentWeek || assignment.roster_date < currentWeek.week_start_date)
    .sort((a, b) => b.roster_date.localeCompare(a.roster_date))
    .slice(0, 20);

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Scheduled" value={summary.scheduled_days ?? 0} tone="success" />
        <Metric label="Off days" value={summary.off_days ?? 0} tone="info" />
        <Metric label="Leave days" value={summary.leave_days ?? 0} tone="warning" />
        <Metric label="Work minutes" value={summary.scheduled_minutes ?? 0} tone="info" />
      </div>
      <AssignmentSection title="Current week schedule" description={currentWeek ? `${currentWeek.week_start_date} to ${currentWeek.week_end_date}` : "This week's roster assignments."} rows={currentRows} loading={loading} canManage={canManage} emptyTitle="No current week roster" onEdit={setEditing} />
      <AssignmentSection title="Upcoming schedule" description="Future published or draft schedule rows." rows={upcomingRows} loading={false} canManage={canManage} emptyTitle="No upcoming roster" onEdit={setEditing} />
      <AssignmentSection title="Past roster history" description="Recent completed roster assignments." rows={pastRows} loading={false} canManage={canManage} emptyTitle="No past roster history" onEdit={setEditing} />
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">Recent roster change history</h3><p className="text-xs text-muted-foreground">Assignment history rows and edit reasons for this employee.</p></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reason</TableHead><TableHead>Changed at</TableHead></TableRow></TableHeader>
            <TableBody>{history.slice(0, 12).map((row, index) => <TableRow key={String(row.id ?? index)}><TableCell>{String(row.roster_date ?? "-")}</TableCell><TableCell>{String(row.change_reason ?? "-")}</TableCell><TableCell>{String(row.created_at ?? "-")}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
      </Panel>
      {editing ? (
        <RosterAssignmentModal
          title="Edit roster assignment"
          subtitle={`${employee.employee_no} - ${employee.full_name} - ${editing.roster_date}`}
          assignment={editing}
          shiftTemplates={shiftTemplates}
          requireReason={editing.period_status === "PUBLISHED"}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function AssignmentSection({ title, description, rows, loading, canManage, emptyTitle, onEdit }: { title: string; description: string; rows: RosterAssignment[]; loading: boolean; canManage: boolean; emptyTitle: string; onEdit: (assignment: RosterAssignment) => void }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Shift</TableHead><TableHead>Start/end</TableHead><TableHead>Minutes</TableHead><TableHead>Leave</TableHead><TableHead>Attendance</TableHead><TableHead>Period</TableHead>{canManage ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
          <TableBody>{rows.map((assignment) => <AssignmentRow key={assignment.id ?? `${assignment.employee_id}-${assignment.roster_date}`} assignment={assignment} canManage={canManage} onEdit={onEdit} />)}</TableBody>
        </Table>
      </div>
      {loading ? <EmptyState title="Loading roster" description="Fetching employee roster assignments." /> : rows.length === 0 ? <EmptyState title={emptyTitle} description="Roster assignments will appear here after weekly planning." /> : null}
    </Panel>
  );
}

function AssignmentRow({ assignment, canManage, onEdit }: { assignment: RosterAssignment; canManage: boolean; onEdit: (assignment: RosterAssignment) => void }) {
  const time = assignment.custom_start_time && assignment.custom_end_time ? `${assignment.custom_start_time} - ${assignment.custom_end_time}` : assignment.shift_start_time && assignment.shift_end_time ? `${assignment.shift_start_time} - ${assignment.shift_end_time}` : "-";
  return (
    <TableRow>
      <TableCell>{assignment.roster_date}</TableCell>
      <TableCell><Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge></TableCell>
      <TableCell>{assignment.shift_code ? `${assignment.shift_code} - ${assignment.shift_name}` : "-"}</TableCell>
      <TableCell>{time}</TableCell>
      <TableCell>{assignment.total_work_minutes ?? "-"}</TableCell>
      <TableCell>{assignment.leave_indicator ? <Badge tone="warning">{assignment.leave_indicator}</Badge> : "-"}</TableCell>
      <TableCell>{assignment.attendance_indicator ? <Badge tone="info">{assignment.attendance_indicator}</Badge> : "-"}</TableCell>
      <TableCell>{assignment.period_status ? <Badge tone={assignment.period_status === "PUBLISHED" ? "success" : "neutral"}>{assignment.period_status}</Badge> : "-"}</TableCell>
      {canManage ? <TableCell><div className="flex justify-end"><Button title="Edit assignment" variant="ghost" size="icon" onClick={() => onEdit(assignment)}><Edit className="h-4 w-4" /></Button></div></TableCell> : null}
    </TableRow>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "info" | "warning" | "danger" | "success" }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex items-center justify-between"><span className="text-xl font-semibold">{value}</span><Badge tone={tone}>{label}</Badge></div></div>;
}
