import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

// V3 pastel-tint palette: light background, saturated text/border for contrast.
const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]",
  warning: "border-[#FAC775] bg-[#FAEEDA] text-[#854F0B]",
  danger: "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]",
  info: "border-[#A9C6EE] bg-[#E6EDFB] text-[#2F5FA8]"
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-md border px-2 text-xs font-medium", toneClasses[tone], className)}
      {...props}
    />
  );
}
