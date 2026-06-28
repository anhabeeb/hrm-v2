import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

const TOOLTIP_WIDTH = 288;
const TOOLTIP_MARGIN = 12;

export function Tooltip({ children, content, className }: { children: ReactNode; content: ReactNode; className?: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(TOOLTIP_MARGIN, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
    const preferredLeft = rect.right - TOOLTIP_WIDTH;
    setPosition({
      left: Math.min(Math.max(TOOLTIP_MARGIN, preferredLeft), maxLeft),
      top: rect.bottom + 8
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const showTooltip = () => {
    updatePosition();
    setOpen(true);
  };

  return (
    <span
      ref={triggerRef}
      className={cn("group/tooltip inline-flex", className)}
      aria-describedby={open ? id : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setOpen(false)}
      onFocus={showTooltip}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && position && typeof document !== "undefined"
        ? createPortal(
          <span
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-72 rounded-md border bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 shadow-lg"
            style={{ left: position.left, top: position.top }}
          >
            {content}
          </span>,
          document.body
        )
        : null}
    </span>
  );
}
