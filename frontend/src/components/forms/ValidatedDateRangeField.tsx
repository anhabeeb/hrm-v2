import { useMemo } from "react";
import { DatePickerField, InputField } from "../ui/page-shell";
import { FieldError } from "./FieldError";
import { validateDateRange, type ValidationIssue } from "../../lib/validation";

export function ValidatedDateRangeField({
  start,
  end,
  onStartChange,
  onEndChange,
  startLabel = "Date from",
  endLabel = "Date to",
  issues = []
}: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  issues?: ValidationIssue[];
}) {
  const dateIssues = useMemo(() => validateDateRange({ start, end, startField: "date_from", endField: "date_to", label: endLabel }), [end, endLabel, start]);
  const allIssues = [...issues, ...dateIssues];
  return (
    <>
      <DatePickerField label={startLabel}>
        <InputField type="date" value={start} onChange={(event) => onStartChange(event.target.value)} />
      </DatePickerField>
      <div className="space-y-1.5">
        <DatePickerField label={endLabel}>
          <InputField type="date" value={end} onChange={(event) => onEndChange(event.target.value)} />
        </DatePickerField>
        <FieldError issues={allIssues.filter((issue) => issue.field === "date_to")} />
      </div>
    </>
  );
}
