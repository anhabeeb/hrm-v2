import type { ValidationIssue } from "../../lib/validation";

export function FieldError({ issues }: { issues?: ValidationIssue[] }) {
  const first = issues?.find((issue) => issue.severity === "error");
  if (!first) return null;
  return <p className="text-xs leading-5 text-red-700">{first.message}</p>;
}
