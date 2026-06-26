import { AlertTriangle, Lock, Power } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "../ui/badge";
import { ConfirmDialog } from "../ui/dialogs";
import { Switch } from "../ui/switch";
import { cn } from "../../lib/utils";

interface ModuleToggleHeaderProps {
  moduleName: string;
  enabled: boolean;
  permissionCanUpdate: boolean;
  description?: ReactNode;
  disabledDescription?: ReactNode;
  dependencyWarnings?: string[];
  isSaving?: boolean;
  onToggle: (enabled: boolean) => Promise<void> | void;
}

export function ModuleToggleHeader({
  moduleName,
  enabled,
  permissionCanUpdate,
  description,
  disabledDescription,
  dependencyWarnings = [],
  isSaving,
  onToggle
}: ModuleToggleHeaderProps) {
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const busy = Boolean(isSaving || localSaving);

  async function applyToggle(nextEnabled: boolean) {
    setLocalSaving(true);
    try {
      await onToggle(nextEnabled);
    } finally {
      setLocalSaving(false);
    }
  }

  function requestToggle(nextEnabled: boolean) {
    if (!permissionCanUpdate || busy) return;
    if (!nextEnabled && dependencyWarnings.length > 0) {
      setConfirmDisableOpen(true);
      return;
    }
    void applyToggle(nextEnabled);
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-panel">
      <div className="flex flex-col gap-4 border-b bg-slate-50/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 rounded-md border p-2", enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
            <Power className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950">{moduleName} module</h2>
              <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
            </div>
            {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
            {!enabled && disabledDescription ? <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-700">{disabledDescription}</p> : null}
            {!permissionCanUpdate ? (
              <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <Lock className="h-3.5 w-3.5" />
                You do not have permission to enable or disable this module.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{busy ? "Saving..." : enabled ? "On" : "Off"}</span>
          <Switch checked={enabled} disabled={!permissionCanUpdate || busy} aria-label={`${enabled ? "Disable" : "Enable"} ${moduleName} module`} onCheckedChange={requestToggle} />
        </div>
      </div>
      {dependencyWarnings.length > 0 ? (
        <div className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Disabling this module may affect related workflows.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {dependencyWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDisableOpen}
        title={`Disable ${moduleName} module?`}
        description={
          <span>
            This will grey out settings and block module operations while keeping this top control available. Related dependencies: {dependencyWarnings.join(" ")}
          </span>
        }
        tone="danger"
        confirmLabel="Disable module"
        onCancel={() => setConfirmDisableOpen(false)}
        onConfirm={() => {
          setConfirmDisableOpen(false);
          void applyToggle(false);
        }}
      />
    </section>
  );
}

export function ModuleSettingsBody({ disabled, children, className }: { disabled: boolean; children: ReactNode; className?: string }) {
  return (
    <fieldset disabled={disabled} className={cn("rounded-lg transition", disabled && "bg-slate-50/75 opacity-65", className)}>
      {disabled ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-muted-foreground">
          This module is currently disabled. Enable it to edit settings or use related features.
        </div>
      ) : null}
      {children}
    </fieldset>
  );
}
