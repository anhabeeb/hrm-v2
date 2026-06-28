import { isValidElement, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "actionCreate"
  | "actionSave"
  | "actionNeutral"
  | "actionExport"
  | "actionImport"
  | "actionWarning"
  | "actionDestructive"
  | "actionDisabled";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-muted text-foreground hover:bg-muted/80",
  ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  outline: "border bg-background text-foreground hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  actionCreate: "bg-primary text-primary-foreground hover:bg-primary/90",
  actionSave: "bg-emerald-600 text-white hover:bg-emerald-700",
  actionNeutral: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  actionExport: "bg-sky-600 text-white hover:bg-sky-700",
  actionImport: "bg-sky-600 text-white hover:bg-sky-700",
  actionWarning: "border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200",
  actionDestructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  actionDisabled: "border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9 p-0"
};

const ICON_ACTION_LABELS: Record<string, string> = {
  Archive: "Archive",
  Check: "Confirm",
  CheckCircle: "Approve",
  CheckCircle2: "Approve",
  Download: "Download",
  Edit: "Edit",
  Eye: "View details",
  History: "View history",
  LogOut: "Logout",
  Menu: "Open navigation",
  Paperclip: "Manage attachments",
  Pencil: "Edit",
  Plus: "Add",
  Power: "Toggle status",
  RefreshCw: "Refresh",
  RotateCcw: "Submit",
  Trash: "Delete",
  Trash2: "Delete",
  Upload: "Upload",
  X: "Cancel",
  XCircle: "Cancel"
};

const EXACT_NEUTRAL_ACTION_LABELS = new Set(["cancel", "close", "dismiss", "back", "clear", "reset"]);
const DESTRUCTIVE_CANCEL_ACTION_PATTERN = /\bcancel\s+(leave|payroll|contract|request|case|record|run|row|employee|onboarding|offboarding|settlement|payment|period|advance|adjustment|deduction|loan|document)\b/;

function iconLabelFromReactNode(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(iconLabelFromReactNode).filter(Boolean).join(" ");
  if (!isValidElement(value)) return "";
  const componentType = value.type as { displayName?: string; name?: string };
  const typeName = typeof value.type === "function" || typeof value.type === "object"
    ? componentType.displayName ?? componentType.name ?? ""
    : "";
  return ICON_ACTION_LABELS[typeName] ?? "";
}

function textFromReactNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromReactNode).join(" ");
  if (isValidElement(value)) {
    const props = value.props as { children?: ReactNode; "aria-label"?: string; title?: string };
    return [props["aria-label"], props.title, textFromReactNode(props.children), iconLabelFromReactNode(value)].filter(Boolean).join(" ");
  }
  return "";
}

function inferActionVariant(label: string): ButtonVariant {
  const text = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return "actionCreate";
  if (EXACT_NEUTRAL_ACTION_LABELS.has(text)) return "actionNeutral";
  if (/\b(delete|reject|disable|archive|remove|permanent delete)\b/.test(text)) return "actionDestructive";
  if (DESTRUCTIVE_CANCEL_ACTION_PATTERN.test(text)) return "actionDestructive";
  if (/\b(send back|hold|put on hold|reopen|needs review|warning|damaged|lost)\b/.test(text)) return "actionWarning";
  if (/\b(save|confirm|activate|approve|complete|finalize|return|publish)\b/.test(text)) return "actionSave";
  if (/\b(export|download)\b/.test(text)) return "actionExport";
  if (/\b(import|upload)\b/.test(text)) return "actionImport";
  if (/\b(refresh|settings|view|open|details|more|filter|reset|copy|preview|edit|load|diagnostic|clear current browser cache)\b/.test(text)) return "actionNeutral";
  if (/\b(create|add|new|link|start|issue)\b/.test(text)) return "actionCreate";
  return "actionCreate";
}

export function Button({ className, variant, size = "md", type = "button", children, disabled, title, "aria-label": ariaLabel, ...props }: ButtonProps) {
  const label = [ariaLabel, title, textFromReactNode(children)].filter(Boolean).join(" ");
  const effectiveVariant = disabled ? "actionDisabled" : variant ?? inferActionVariant(label);
  const effectiveAriaLabel = ariaLabel ?? (size === "icon" ? title ?? (label || "Action") : undefined);

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-transparent font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
        variantClasses[effectiveVariant],
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      title={title ?? (size === "icon" ? effectiveAriaLabel : undefined)}
      aria-label={effectiveAriaLabel}
      {...props}
    >
      {children}
    </button>
  );
}
