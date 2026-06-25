import type { ReactNode } from "react";
import { Button } from "./button";
import { Input } from "./input";

interface DetailDrawerProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

export function DetailDrawer({ open, title, description, children, onClose, actions }: DetailDrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25">
      <button className="absolute inset-0" aria-label="Close detail drawer" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l bg-white shadow-xl">
        <header className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {actions ? <footer className="border-t bg-slate-50 px-5 py-3">{actions}</footer> : null}
      </aside>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonValue?: string;
  onReasonChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  requireReason,
  reasonLabel = "Reason",
  reasonValue = "",
  onReasonChange,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  if (!open) return null;
  const disabled = Boolean(requireReason && !reasonValue.trim());
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {requireReason || onReasonChange ? (
          <div className="px-5 py-4">
            <label className="grid gap-1 text-sm font-medium">
              {reasonLabel}{requireReason ? " *" : ""}
              <Input value={reasonValue} onChange={(event) => onReasonChange?.(event.target.value)} placeholder="Add a note for audit history" />
            </label>
            {disabled ? <p className="mt-1 text-xs text-red-600">Reason is required.</p> : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={disabled}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
