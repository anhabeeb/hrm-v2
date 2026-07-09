import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { ProgressRing } from "../components/ui/progress-ring";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { Employee } from "../types/employees";

type SetupSummary = {
  section_count?: number;
  required_count?: number;
  complete_required_count?: number;
  blocked_count?: number;
  failed_count?: number;
  stale_count?: number;
};
type SetupEmployee = Employee & { setup_summary?: SetupSummary };

function toneFor(summary?: SetupSummary) {
  if (Number(summary?.failed_count ?? 0) > 0) return { bg: "#FCEBEB", text: "#A32D2D" };
  if (Number(summary?.blocked_count ?? 0) > 0 || Number(summary?.stale_count ?? 0) > 0) return { bg: "#FAEEDA", text: "#854F0B" };
  if (Number(summary?.required_count ?? 0) > 0 && Number(summary?.complete_required_count ?? 0) >= Number(summary?.required_count ?? 0)) return { bg: "#EAF3DE", text: "#27500A" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function EmployeeSetupListPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<SetupEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listEmployeeSetupQueue(token, {}).then((res) => setRows((res.setup_employees ?? res.employees ?? []) as SetupEmployee[])).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div>
        <p className="text-lg font-medium text-slate-950">Employee 360 setup</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Complete pending employee setup, run final verification, and submit activation</p>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
      ) : rows.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((employee) => {
            const summary = employee.setup_summary;
            const complete = Number(summary?.complete_required_count ?? 0);
            const required = Number(summary?.required_count ?? 0);
            const percent = required ? Math.round((complete / required) * 100) : 0;
            const tone = toneFor(summary);
            return (
              <Link key={employee.id} to={employee.active_onboarding_case_id ? `/onboarding/${employee.active_onboarding_case_id}` : `/employees/${employee.id}?setup=1`}>
                <Panel className="flex items-center gap-3.5 p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                  <ProgressRing value={complete} max={Math.max(required, 1)} color="#5B4FE9" label="" sublabel="complete" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{employee.full_name} <span className="font-normal text-muted-foreground">{employee.employee_no}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{employee.department_name ?? "No department"}{employee.position_title ? ` · ${employee.position_title}` : ""} · Source case {employee.active_onboarding_case_number ?? "-"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{required ? `${complete}/${required} required` : "Not built"}</span>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] text-muted-foreground">{employee.status_name ?? employee.status_key ?? "-"}</span>
                </Panel>
              </Link>
            );
          })}
        </div>
      ) : (
        <Panel className="mt-3"><EmptyState title="No pending setup employees" description="Employees waiting for setup or final verification will appear here." /></Panel>
      )}
    </PageShell>
  );
}
