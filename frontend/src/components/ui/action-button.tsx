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

export type ActionTextIntent =
  | "create"
  | "start"
  | "generate"
  | "submit"
  | "save"
  | "approve"
  | "confirm"
  | "complete"
  | "enable"
  | "release"
  | "finalize"
  | "neutral"
  | "view"
  | "open"
  | "details"
  | "refresh"
  | "warning"
  | "hold"
  | "send-back"
  | "reopen"
  | "waive"
  | "block"
  | "manual-adjustment"
  | "destructive"
  | "delete"
  | "reject"
  | "disable"
  | "archive"
  | "remove"
  | "cancel-record"
  | "download"
  | "export"
  | "upload"
  | "import";

const ACTION_TEXT_INTENT_TO_BUTTON_INTENT: Record<ActionTextIntent, ActionButtonIntent> = {
  create: "create",
  start: "create",
  generate: "create",
  submit: "save",
  save: "save",
  approve: "save",
  confirm: "save",
  complete: "save",
  enable: "save",
  release: "save",
  finalize: "save",
  neutral: "neutral",
  view: "neutral",
  open: "neutral",
  details: "neutral",
  refresh: "neutral",
  warning: "warning",
  hold: "warning",
  "send-back": "warning",
  reopen: "warning",
  waive: "warning",
  block: "warning",
  "manual-adjustment": "warning",
  destructive: "destructive",
  delete: "destructive",
  reject: "destructive",
  disable: "destructive",
  archive: "destructive",
  remove: "destructive",
  "cancel-record": "destructive",
  download: "export",
  export: "export",
  upload: "import",
  import: "import"
};

export interface ActionTextButtonProps extends Omit<ButtonProps, "variant"> {
  intent: ActionTextIntent;
}

export function ActionTextButton({ intent, ...props }: ActionTextButtonProps) {
  return <ActionButton {...props} intent={ACTION_TEXT_INTENT_TO_BUTTON_INTENT[intent]} />;
}
