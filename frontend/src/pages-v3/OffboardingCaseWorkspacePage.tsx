import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CircleCheck, CircleDashed } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import type { LifecycleTask, OffboardingCase } from "../types/lifecycle";
import type { Employee } from "../types/employees";

function text(value: unknown, fallback = "") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}

const AVATAR_COLOR_PALETTE = [
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (`${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`).toUpperCase() || "E";
}
function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 84 84" aria-hidden="true" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#E7E7F1" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#5B4FE9" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="500" fill="#14162B">{percent}%</text>
    </svg>
  );
}

type TileKey = "assets_uniforms" | "payroll" | "user_access" | "final_approval" | "final_settlement";

const TILES: Array<{ key: TileKey; label: string }> = [
  { key: "assets_uniforms", label: "Assets & equipment return" },
  { key: "payroll", label: "Finance clearance" },
  { key: "user_access", label: "IT access revoked" },
  { key: "final_approval", label: "HR final clearance" },
  { key: "final_settlement", label: "Final settlement payout" }
];

// "Exit interview" appears in the mockup but has no backing task_key, table, or column anywhere
// in employee_offboarding_tasks/offboardingTemplates — omitted rather than faked (Phase 3 gap).
const OTHER_TASK_KEYS = ["leave", "attendance_biometric", "roster", "documents"];

const completedStatuses = new Set(["COMPLETED", "WAIVED"]);

function taskFor(tasks: LifecycleTask[], key: string) {
  return tasks.find((t) => t.task_key === key);
}

function isRequired(task: LifecycleTask) {
  return task.is_required === 1 || task.is_required === true;
}

type TileStatus = "complete" | "not_required" | "not_started" | "pending";

function tileStatus(task: LifecycleTask | undefined): TileStatus {
  if (task && completedStatuses.has(String(task.task_status ?? ""))) return "complete";
  if (task && !isRequired(task)) return "not_required";
  if (!task) return "not_started";
  return "pending";
}

function tileVisual(status: TileStatus, waived: boolean) {
  if (status === "complete") return { Icon: CircleCheck, color: "#27500A", badge: <Badge tone="success">{waived ? "Waived" : "Cleared"}</Badge>, dim: false };
  if (status === "not_required") return { Icon: CircleDashed, color: "#9A9DB0", badge: <Badge tone="neutral">Not required</Badge>, dim: true };
  if (status === "not_started") return { Icon: CircleDashed, color: "#9A9DB0", badge: <Badge tone="neutral">Not started</Badge>, dim: false };
  return { Icon: CircleDashed, color: "#854F0B", badge: <Badge tone="warning">Pending</Badge>, dim: false };
}

export function OffboardingCaseWorkspacePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);

  const [caseRow, setCaseRow] = useState<OffboardingCase | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<LifecycleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  async function load() {
    if (!token || !caseId) return;
    setLoading(true);
    setError(null);
    try {
      const [caseResult, readinessResult] = await Promise.all([
        api.getOffboardingCase(token, caseId),
        api.getOffboardingReadiness(token, caseId)
      ]);
      setCaseRow(caseResult.case);
      setEmployee(caseResult.employee);
      const readinessChecklist = (readinessResult.readiness as { checklist?: { tasks?: LifecycleTask[] } } | null)?.checklist;
      setTasks(readinessChecklist?.tasks ?? caseResult.checklist.tasks ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load offboarding case.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, caseId]);

  if (!caseId) return null;

  if (loading && !caseRow) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
      </PageShell>
    );
  }

  if (error && !caseRow) {
    return (
      <PageShell constrained={false}>
        <Panel className="p-4"><EmptyState title="Unable to load offboarding case" description={error} /></Panel>
      </PageShell>
    );
  }

  if (!caseRow) return null;

  const name = text(employee?.full_name ?? caseRow.employee_name, "Employee");
  const color = colorFor(name);
  const roleLine = [text(caseRow.position_name), humanizeTechnicalLabel(caseRow.exit_type)].filter(Boolean).join(" · ");
  const lastDayLine = caseRow.last_working_day ? `Last working day ${caseRow.last_working_day}` : "";

  const requiredTasks = tasks.filter(isRequired);
  const completeCount = requiredTasks.filter((t) => completedStatuses.has(String(t.task_status ?? ""))).length;
  const pct = requiredTasks.length ? Math.round((completeCount / requiredTasks.length) * 100) : 0;

  const otherBlocking = tasks.filter((t) => OTHER_TASK_KEYS.includes(t.task_key) && isRequired(t) && !completedStatuses.has(String(t.task_status ?? "")));

  const canBase = permissions.has("offboarding.tasks.complete") || permissions.has("offboarding.tasks.manage");
  const canAssets = canBase && (permissions.has("assets.manage") || permissions.has("assets.issue") || permissions.has("assets.return"));
  const canFinance = canBase && (permissions.has("payroll.manage") || permissions.has("employees.payroll.update"));
  const canIT = canBase && (permissions.has("users.update") || permissions.has("users.manage") || permissions.has("role_mappings.apply"));
  const canHR = canBase;

  const tileCanClear: Record<TileKey, boolean> = {
    assets_uniforms: canAssets,
    payroll: canFinance,
    user_access: canIT,
    final_approval: canHR,
    final_settlement: false
  };

  async function clearTask(task: LifecycleTask) {
    if (!token) return;
    setBusyTaskId(task.id);
    try {
      await api.completeOffboardingTask(token, task.id);
      alerts.showSuccess("Cleared", `${task.task_name ?? task.title ?? "Item"} marked complete.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to clear this item.");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <Link to="/v3-preview/offboarding" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Offboarding / {name}
        </Link>

        <Panel className="flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(name)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-950">{name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{[roleLine, lastDayLine].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <ProgressRing percent={pct} />
        </Panel>

        {otherBlocking.length ? (
          <Panel className="p-3 text-xs" style={{ background: "#FAEEDA", borderColor: "#FAC775" }}>
            <span className="font-medium text-[#854F0B]">{otherBlocking.length} additional required item{otherBlocking.length > 1 ? "s" : ""}</span>
            <span className="text-[#854F0B]"> ({otherBlocking.map((t) => t.task_name ?? t.title ?? t.task_key).join(", ")}) not shown here — manage from </span>
            <Link to={`/employees/${caseRow.employee_id}`} className="font-medium text-[#854F0B] underline">Employee 360</Link>
          </Panel>
        ) : null}

        {error ? <Panel className="p-3 text-xs text-[#A32D2D]">{error}</Panel> : null}

        <p className="text-xs font-medium text-slate-950">Department clearances</p>

        <div className="flex flex-col gap-2">
          {TILES.map((tile) => {
            const task = taskFor(tasks, tile.key);
            const status = tileStatus(task);
            const waived = task?.task_status === "WAIVED";
            const visual = tileVisual(status, waived);
            const canClear = tileCanClear[tile.key];
            const isFinalSettlement = tile.key === "final_settlement";
            const completedAt = task ? text((task as unknown as Record<string, unknown>).completed_at) : "";

            let action = null;
            if (status !== "complete" && status !== "not_required") {
              if (isFinalSettlement) {
                action = <Link to="/v3-preview/payroll/final-settlement" className="whitespace-nowrap rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">View settlement →</Link>;
              } else if (canClear && task) {
                action = <Button size="sm" variant="actionSave" loading={busyTaskId === task.id} onClick={() => void clearTask(task)}>Clear</Button>;
              } else {
                action = <span className="whitespace-nowrap rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-[11px] text-muted-foreground">View only · not your department</span>;
              }
            }

            return (
              <Panel key={tile.key} className="flex items-center gap-3.5 p-3" style={visual.dim ? { opacity: 0.6 } : undefined}>
                <visual.Icon className="h-[18px] w-[18px] shrink-0" style={{ color: visual.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-950">{tile.label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {status === "complete"
                      ? (completedAt ? `Completed ${completedAt.slice(0, 10)}` : waived ? "Waived" : "Complete")
                      : text(task?.notes, isFinalSettlement ? "Unlocks once all clearances complete" : "Awaiting clearance")}
                  </p>
                </div>
                {visual.badge}
                {action}
              </Panel>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
