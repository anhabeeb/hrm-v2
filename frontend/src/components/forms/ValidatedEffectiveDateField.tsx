import { InputField } from "../ui/page-shell";
import { FieldError } from "./FieldError";
import type { ValidationIssue } from "../../lib/validation";

export function ValidatedEffectiveDateField({ value, onChange, issues = [], label = "Effective date" }: { value: string; onChange: (value: string) => void; issues?: ValidationIssue[]; label?: string }) {
  return (
    <div className="space-y-1.5">
      <InputField label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} helper="Effective dates are checked against locked payroll, attendance, roster, and contract periods on save." />
      <FieldError issues={issues.filter((issue) => issue.field === "effective_date")} />
    </div>
  );
}
