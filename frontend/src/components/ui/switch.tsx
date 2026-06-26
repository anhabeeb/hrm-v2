import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({ checked, disabled, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <label className={cn("relative inline-flex h-6 w-11 shrink-0 items-center", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", className)}>
      <input
        {...props}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      <span className="absolute inset-0 rounded-full border border-slate-300 bg-slate-200 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
      <span className="relative ml-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
    </label>
  );
}
