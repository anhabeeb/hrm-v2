import { AlertBanner } from "../ui/page-shell";
import type { ValidationIssue } from "../../lib/validation";

export function FormWarningAlert({ issues }: { issues: ValidationIssue[] }) {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  if (!warnings.length) return null;
  return (
    <AlertBanner tone="warning">
      <div className="space-y-1">
        {warnings.map((issue, index) => <p key={`${issue.code}-${index}`}>{issue.message}</p>)}
      </div>
    </AlertBanner>
  );
}
