import { AlertBanner } from "../ui/page-shell";
import type { ValidationIssue } from "../../lib/validation";

export function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!errors.length) return null;
  return (
    <AlertBanner tone="danger">
      <div className="space-y-2">
        <p className="font-medium">Please correct these items before saving.</p>
        <ul className="list-disc space-y-1 pl-5">
          {errors.map((issue, index) => (
            <li key={`${issue.code}-${issue.field ?? "form"}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      </div>
    </AlertBanner>
  );
}
