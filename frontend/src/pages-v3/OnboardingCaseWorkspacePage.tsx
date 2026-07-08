import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { EmptyState } from "../components/ui/empty-state";

export function OnboardingCaseWorkspacePage() {
  const { caseId } = useParams<{ caseId: string }>();
  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <Link to="/v3-preview/onboarding" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Onboarding
        </Link>
        <Panel>
          <EmptyState
            title="Case workspace redesign in progress"
            description={`The checklist workspace for this case (${caseId}) is being converted to the approved design in a follow-up pass. Use Employee 360's setup view in the meantime.`}
          />
        </Panel>
      </div>
    </PageShell>
  );
}
