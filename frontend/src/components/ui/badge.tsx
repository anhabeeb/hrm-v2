import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "categoryBlue"
  | "categoryCoral"
  | "categoryGreen"
  | "categoryPinkViolet"
  | "categoryAmber"
  | "categoryRed";

// V3 pastel-tint palette: light background, saturated text/border for contrast.
// success/warning/danger/info are semantic aliases onto the same 6 category colors
// (info -> blue, success -> green, warning -> amber, danger -> red) — kept as
// separate names because callers reach for them by meaning, not by color, but
// the hex values are the single approved category palette, not independent colors.
const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-[#5DCAA5] bg-[#EAF3DE] text-[#27500A]",
  warning: "border-[#FAC775] bg-[#FAEEDA] text-[#854F0B]",
  danger: "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]",
  info: "border-[#378ADD] bg-[#E6F1FB] text-[#0C447C]",
  categoryBlue: "border-[#378ADD] bg-[#E6F1FB] text-[#0C447C]",
  categoryCoral: "border-[#F0997B] bg-[#FAECE7] text-[#993C1D]",
  categoryGreen: "border-[#5DCAA5] bg-[#EAF3DE] text-[#27500A]",
  categoryPinkViolet: "border-[#AFA9EC] bg-[#EEEDFE] text-[#534AB7]",
  categoryAmber: "border-[#FAC775] bg-[#FAEEDA] text-[#854F0B]",
  categoryRed: "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]"
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
