import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { CONTRACTS_NAV_ITEMS } from "./contractsNav";

type Row = Record<string, unknown>;

const DOT_COLORS = ["#AFA9EC", "#F0997B", "#7FB8DE", "#8FCB9E", "#FAC775", "#E895B3"];

function typeDescription(type: Row) {
  const parts: string[] = [];
  parts.push(type.default_duration_months ? `${type.default_duration_months} mo default duration` : "No fixed duration");
  parts.push(type.requires_probation ? `Probation required${type.default_probation_months ? ` (${type.default_probation_months} mo)` : ""}` : "No probation");
  parts.push(type.allows_renewal ? "Renewable" : "Not renewable");
  return parts.join(" · ");
}

export function ContractsTypesPage() {
  const { token } = useAuth();
  const [types, setTypes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listContractTypes(token, {}).then((res) => setTypes(res.types)).finally(() => setLoading(false));
  }, [token]);

  const active = types.filter((t) => t.is_active !== false && t.status !== "ARCHIVED" && !t.archived_at);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={CONTRACTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Types</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reference view — contract type durations and rules</p>
            </div>
            <Link to="/settings/contracts" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Manage in Settings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
          ) : active.length ? (
            <div className="flex flex-col gap-2">
              {active.map((type, i) => (
                <Panel key={String(type.id)} className="flex items-center gap-3.5 p-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{String(type.name ?? type.code)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{typeDescription(type)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[9px] text-muted-foreground">{String(type.category ?? "")}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No contract types configured" description="Set up contract types in Settings." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
