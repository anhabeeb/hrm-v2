import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { DOCUMENTS_NAV_ITEMS } from "./documentsNav";
import type { MissingDocument } from "../types/documents";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

interface EmployeeMissingGroup {
  employeeId: string;
  employeeName: string;
  departmentName: string | null;
  types: string[];
}

export function DocumentsMissingPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<MissingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listMissingDocuments(token, {}).then((res) => setRows(res.missing ?? [])).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load missing documents.")).finally(() => setLoading(false));
  }, [token]);

  const groups = useMemo<EmployeeMissingGroup[]>(() => {
    const map = new Map<string, EmployeeMissingGroup>();
    for (const row of rows) {
      const existing = map.get(row.employee_id);
      if (existing) {
        existing.types.push(row.document_type_name);
      } else {
        map.set(row.employee_id, { employeeId: row.employee_id, employeeName: row.employee_name, departmentName: row.department_name, types: [row.document_type_name] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [rows]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <RouteNavSwitcher items={DOCUMENTS_NAV_ITEMS} moduleLabel="Documents" className="px-4" />

          <Panel className="shadow-none space-y-3 p-4">
            {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

            {loading ? (
              <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
            ) : groups.length ? (
              <div className="flex flex-col gap-2">
                {groups.map((group) => {
                  const color = colorFor(group.employeeName);
                  return (
                    <Panel key={group.employeeId} className="flex items-center gap-3.5 p-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(group.employeeName)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{group.employeeName}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Missing: {group.types.join(", ")}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/v3-preview/employees/${group.employeeId}`)}>View employee</Button>
                    </Panel>
                  );
                })}
              </div>
            ) : (
              <Panel><EmptyState title="No missing documents" description="Everyone has their required documents on file." /></Panel>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
