import type { ExcelTemplateDefinition, ExcelValidationRule, ExportColumn } from "./export-utils";
import { friendlyColumnLabel } from "./export-utils";

export type ImportColumnDefinition = ExportColumn & {
  required?: boolean;
  sensitive?: boolean;
  protected?: boolean;
  enumKey?: string;
  accepted_values?: string[];
  sample?: unknown;
  note?: string;
};

export type ImportTemplateDefinition = {
  key: string;
  label: string;
  category?: string;
  moduleKey?: string;
  description?: string;
  requiredColumns?: string[];
  columns: ImportColumnDefinition[];
  validation_notes?: string[];
  lookup_values?: Record<string, string[]>;
};

export type ImportPreviewIssue = {
  row_number?: number;
  field?: string;
  column_name?: string;
  submitted_value?: unknown;
  error_message?: string;
  severity?: "error" | "warning";
  suggested_correction?: string;
};

export type ImportPreviewSummary = {
  total_rows?: number;
  valid_rows?: number;
  invalid_rows?: number;
  duplicate_rows?: number;
  warnings?: number;
  skipped_rows?: number;
  rows?: Record<string, unknown>[];
};

const dateFieldPattern = /(date|joined|effective|expiry|start|end|due|period)/i;
const numericFieldPattern = /(amount|salary|percentage|quantity|count|days|hours|minutes|balance|value|installment|principal)/i;
const textLengthFieldPattern = /(code|number|email|phone|passport|reference|account)/i;

export function templateColumnsWithRequiredMarkers(template: ImportTemplateDefinition) {
  return template.columns.map((column) => ({
    key: column.key,
    label: `${column.label ?? friendlyColumnLabel(column.key)}${column.required ? " *" : ""}`,
    required: column.required,
    sample: column.sample,
    note: column.note
  }));
}

export function buildExcelValidationsForTemplate(template: ImportTemplateDefinition): ExcelValidationRule[] {
  return template.columns.flatMap((column): ExcelValidationRule[] => {
    const prompt = [column.required ? "Required field." : "", column.note].filter(Boolean).join(" ");
    const rules: ExcelValidationRule[] = [];
    if (column.accepted_values?.length) rules.push({ columnKey: column.key, type: "list", values: column.accepted_values, required: column.required, prompt: prompt || "Choose an allowed value." });
    if (dateFieldPattern.test(column.key)) rules.push({ columnKey: column.key, type: "date", required: column.required, prompt: prompt || "Use YYYY-MM-DD." });
    if (numericFieldPattern.test(column.key)) rules.push({ columnKey: column.key, type: column.key.includes("count") || column.key.includes("quantity") ? "whole" : "decimal", required: column.required, min: 0, max: column.key.includes("percentage") ? 100 : 999999999, prompt: prompt || "Use a non-negative number." });
    if (textLengthFieldPattern.test(column.key)) rules.push({ columnKey: column.key, type: "textLength", required: column.required, min: 0, max: 255, prompt: prompt || "Use a concise text value." });
    return rules;
  });
}

export function buildExcelTemplateDefinition(template: ImportTemplateDefinition): ExcelTemplateDefinition {
  return {
    title: template.label,
    instructions: [
      `${template.label} import template.`,
      "Fill data in the Template sheet only.",
      "Required fields are marked with *.",
      "Use YYYY-MM-DD for dates.",
      "Dropdown columns use values from the hidden Lookups sheet.",
      "Do not rename columns or delete lookup/instruction sheets.",
      "Upload the completed file for validation preview before applying.",
      "Use valid combinations for Department, Job Level, and Position from HRM reference data; backend validation is authoritative.",
      ...(template.validation_notes ?? [])
    ],
    columns: templateColumnsWithRequiredMarkers(template),
    validations: buildExcelValidationsForTemplate(template),
    lookupGroups: template.lookup_values ?? Object.fromEntries(template.columns.filter((column) => column.accepted_values?.length).map((column) => [column.key, column.accepted_values ?? []]))
  };
}

export function summarizePreview(preview: ImportPreviewSummary | null) {
  return [
    { label: "Valid rows", value: preview?.valid_rows ?? 0, tone: "success" as const },
    { label: "Invalid rows", value: preview?.invalid_rows ?? 0, tone: "danger" as const },
    { label: "Warnings", value: preview?.warnings ?? 0, tone: "warning" as const },
    { label: "Duplicates", value: preview?.duplicate_rows ?? 0, tone: "warning" as const },
    { label: "Skipped", value: preview?.skipped_rows ?? 0, tone: "neutral" as const }
  ];
}

export function rowLevelIssueFromImportRow(row: Record<string, unknown>): ImportPreviewIssue {
  return {
    row_number: Number(row.row_number ?? 0),
    field: String(row.field ?? row.column_name ?? "row"),
    column_name: String(row.column_name ?? row.field ?? "Row"),
    submitted_value: row.submitted_value ?? row.raw_row ?? "",
    error_message: String(row.error_message ?? row.message ?? row.validation_status ?? ""),
    severity: String(row.validation_status ?? "").toUpperCase() === "WARNING" ? "warning" : "error",
    suggested_correction: String(row.suggested_correction ?? "Review the template instructions and allowed values.")
  };
}
