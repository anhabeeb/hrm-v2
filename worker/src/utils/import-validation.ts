export type ImportValidationIssue = {
  row_number: number;
  field: string;
  column_name: string;
  submitted_value: unknown;
  error_message: string;
  severity: "error" | "warning";
  suggested_correction?: string;
};

export function requiredFieldIssue(rowNumber: number, field: string): ImportValidationIssue {
  return {
    row_number: rowNumber,
    field,
    column_name: field.replace(/_/g, " "),
    submitted_value: "",
    error_message: `${field} is required.`,
    severity: "error",
    suggested_correction: "Fill the required value marked with * in the Excel template."
  };
}

export function validationMessageToIssue(rowNumber: number, message: string, rawRow: Record<string, unknown>): ImportValidationIssue {
  const field = message.split(" ")[0]?.replace(/[^a-zA-Z0-9_]/g, "") || "row";
  return {
    row_number: rowNumber,
    field,
    column_name: field.replace(/_/g, " "),
    submitted_value: rawRow[field] ?? rawRow,
    error_message: message,
    severity: /placeholder|warning/i.test(message) ? "warning" : "error",
    suggested_correction: "Review allowed values, reference codes, and backend validation rules before applying."
  };
}
