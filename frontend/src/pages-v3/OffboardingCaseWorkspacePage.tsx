import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { EmptyState } from "../components/ui/empty-state";

export function OffboardingCaseWorkspacePage() {
  const { caseId } = useParams<{ caseId: string }>();
  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <Link to="/v3-preview/offboarding" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Offboarding
        </Link>
        <Panel>
          <EmptyState
            title="Case workspace redesign in progress"
            description={`The clearance workspace for this case (${caseId}) is being converted to the approved design in a follow-up pass. Use the existing offboarding case detail in the meantime.`}
          />
        </Panel>
      </div>
    </PageShell>
  );
}
