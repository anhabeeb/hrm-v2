import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { FieldError } from "./FieldError";
import type { ValidationIssue } from "../../lib/form-validation";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SelectField, TextareaField } from "../ui/page-shell";

function hasError(issues?: ValidationIssue[]) {
  return Boolean(issues?.some((issue) => issue.severity === "error"));
}

export function validationClass(issues?: ValidationIssue[]) {
  return hasError(issues) ? "border-red-300 focus:border-red-500 focus:ring-red-500/15 focus-visible:ring-red-500" : undefined;
}

export function ValidatedTextField({
  field,
  label,
  value,
  onChange,
  issues,
  type = "text",
  helper,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  field: string;
  label: ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  issues?: ValidationIssue[];
  helper?: ReactNode;
}) {
  const fieldIssues = issues?.filter((issue) => issue.field === field);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        {...props}
        name={field}
        data-validation-field={field}
        aria-invalid={hasError(fieldIssues) || undefined}
        type={type}
        value={value}
        className={cn(validationClass(fieldIssues), className)}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <FieldError issues={fieldIssues} />
    </div>
  );
}

export function ValidatedSelectField({
  field,
  label,
  value,
  onValueChange,
  issues,
  children,
  helper,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  field: string;
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  issues?: ValidationIssue[];
  helper?: ReactNode;
  children: ReactNode;
}) {
  const fieldIssues = issues?.filter((issue) => issue.field === field);
  return (
    <div className="space-y-1.5">
      <SelectField
        {...props}
        name={field}
        data-validation-field={field}
        aria-invalid={hasError(fieldIssues) || undefined}
        label={label}
        helper={helper}
        value={value}
        className={cn(validationClass(fieldIssues), className)}
        onValueChange={onValueChange}
      >
        {children}
      </SelectField>
      <FieldError issues={fieldIssues} />
    </div>
  );
}

export function ValidatedReasonField({
  field = "reason",
  label = "Reason",
  value,
  onChange,
  issues,
  required,
  placeholder,
  className
}: {
  field?: string;
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  issues?: ValidationIssue[];
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <ValidatedTextField
      field={field}
      label={label}
      value={value}
      required={required}
      placeholder={placeholder ?? (required ? "Reason required" : "Optional note")}
      issues={issues}
      className={className}
      onChange={onChange}
    />
  );
}

export function ValidatedFileField({
  field,
  label,
  issues,
  helper,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  field: string;
  label: ReactNode;
  issues?: ValidationIssue[];
  helper?: ReactNode;
}) {
  const fieldIssues = issues?.filter((issue) => issue.field === field);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        {...props}
        name={field}
        data-validation-field={field}
        aria-invalid={hasError(fieldIssues) || undefined}
        type="file"
        className={cn(validationClass(fieldIssues), className)}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <FieldError issues={fieldIssues} />
    </div>
  );
}

export function ValidatedTextareaField({
  field,
  label,
  value,
  onChange,
  issues,
  helper,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  field: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  issues?: ValidationIssue[];
  helper?: ReactNode;
}) {
  const fieldIssues = issues?.filter((issue) => issue.field === field);
  return (
    <div className="space-y-1.5">
      <TextareaField
        {...props}
        name={field}
        data-validation-field={field}
        aria-invalid={hasError(fieldIssues) || undefined}
        label={label}
        helper={helper}
        value={value}
        className={cn(validationClass(fieldIssues), className)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError issues={fieldIssues} />
    </div>
  );
}
