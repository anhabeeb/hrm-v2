import { useMemo } from "react";
import { InputField } from "../ui/page-shell";
import { FieldError } from "./FieldError";
import { validateAmount, type ValidationIssue } from "../../lib/validation";

export function ValidatedAmountField({
  label,
  value,
  field,
  onChange,
  min = 0,
  max,
  issues = []
}: {
  label: string;
  value: string | number;
  field: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  issues?: ValidationIssue[];
}) {
  const amountIssues = useMemo(() => validateAmount({ value, field, label, min, max }), [field, label, max, min, value]);
  const allIssues = [...issues, ...amountIssues];
  return (
    <div className="space-y-1.5">
      <InputField label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
      <FieldError issues={allIssues.filter((issue) => issue.field === field)} />
    </div>
  );
}
