import { AlertCircle, CheckCircle2, Clock, Info, Loader2, ShieldAlert, X, XCircle } from "lucide-react";
import type { PopupAlert } from "./useAlert";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const typeConfig = {
  success: { icon: CheckCircle2, border: "border-emerald-200", bg: "bg-emerald-50", iconColor: "text-emerald-600", title: "text-emerald-950" },
  error: { icon: XCircle, border: "border-red-200", bg: "bg-red-50", iconColor: "text-red-600", title: "text-red-950" },
  warning: { icon: AlertCircle, border: "border-amber-200", bg: "bg-amber-50", iconColor: "text-amber-600", title: "text-amber-950" },
  info: { icon: Info, border: "border-sky-200", bg: "bg-sky-50", iconColor: "text-sky-600", title: "text-sky-950" },
  loading: { icon: Loader2, border: "border-slate-200", bg: "bg-white", iconColor: "text-primary", title: "text-slate-950", spin: true },
  validation: { icon: AlertCircle, border: "border-amber-200", bg: "bg-amber-50", iconColor: "text-amber-600", title: "text-amber-950" },
  permission: { icon: ShieldAlert, border: "border-red-200", bg: "bg-red-50", iconColor: "text-red-600", title: "text-red-950" },
  "module-disabled": { icon: Clock, border: "border-slate-200", bg: "bg-slate-50", iconColor: "text-slate-600", title: "text-slate-950" },
  "session-expired": { icon: ShieldAlert, border: "border-amber-200", bg: "bg-amber-50", iconColor: "text-amber-600", title: "text-amber-950" }
};

export function PopupAlertCard({ alert, onDismiss }: { alert: PopupAlert; onDismiss: (id: string) => void }) {
  const config = typeConfig[alert.type];
  const Icon = config.icon;
  const isAssertive = ["error", "validation", "permission", "session-expired"].includes(alert.type);

  return (
    <div
      className={cn(
        "pointer-events-auto w-full rounded-lg border px-4 py-3 shadow-lg shadow-slate-900/10",
        "animate-in fade-in slide-in-from-top-2 duration-150",
        config.border,
        config.bg
      )}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconColor, "spin" in config ? "animate-spin" : "")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", config.title)}>{alert.title}</p>
          {alert.message ? <p className="mt-1 break-words text-sm text-slate-700">{alert.message}</p> : null}
          {alert.action ? (
            <Button size="sm" variant={alert.action.variant ?? "outline"} className="mt-3" onClick={alert.action.onClick}>
              {alert.action.label}
            </Button>
          ) : null}
        </div>
        {alert.dismissible !== false ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss alert"
            className="shrink-0 text-slate-500 hover:text-slate-900"
            onClick={() => onDismiss(alert.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
