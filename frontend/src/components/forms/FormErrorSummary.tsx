import { ValidationSummary } from "./ValidationSummary";
import type { ValidationIssue } from "../../lib/form-validation";

export function FormErrorSummary({ issues }: { issues: ValidationIssue[] }) {
  return <ValidationSummary issues={issues} />;
}
