import { Button, type ButtonProps, type ButtonVariant } from "./button";

export type ActionButtonIntent =
  | "create"
  | "save"
  | "neutral"
  | "export"
  | "import"
  | "warning"
  | "destructive"
  | "disabled";

export const ACTION_BUTTON_VARIANT_BY_INTENT: Record<ActionButtonIntent, ButtonVariant> = {
  create: "actionCreate",
  save: "actionSave",
  neutral: "actionNeutral",
  export: "actionExport",
  import: "actionImport",
  warning: "actionWarning",
  destructive: "actionDestructive",
  disabled: "actionDisabled"
};

export interface ActionButtonProps extends Omit<ButtonProps, "variant"> {
  intent: ActionButtonIntent;
}

export function ActionButton({ intent, disabled, ...props }: ActionButtonProps) {
  return (
    <Button
      {...props}
      disabled={disabled}
      variant={disabled ? "actionDisabled" : ACTION_BUTTON_VARIANT_BY_INTENT[intent]}
    />
  );
}
