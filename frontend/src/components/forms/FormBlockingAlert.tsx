import { AlertBanner } from "../ui/page-shell";
import type { ValidationIssue } from "../../lib/validation";

export function FormBlockingAlert({ issues }: { issues: ValidationIssue[] }) {
  const blocking = issues.filter((issue) => issue.severity === "error");
  if (!blocking.length) return null;
  return (
    <AlertBanner tone="danger">
      {blocking.length === 1 ? blocking[0].message : `${blocking.length} blocking validation errors must be fixed before continuing.`}
    </AlertBanner>
  );
}
