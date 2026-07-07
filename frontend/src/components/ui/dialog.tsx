import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// General-purpose centered dialog, replacing the ~72 ad hoc `fixed inset-0 z-50`
// modals across the app (widths ranging 448-896px with no consistent height clamp).
// Same Radix wrapper pattern as Sheet (already a dependency), centered instead of
// slide-in. `md` is the approved default size (640px / min(90vh,800px)) — pass
// `size` only to deviate from it.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export type DialogSize = "sm" | "md" | "lg" | "xl";

const DIALOG_SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "max-w-md", // 448px - simple confirmations
  md: "max-w-[640px]", // approved default
  lg: "max-w-3xl", // 768px - wider content (e.g. multi-column forms)
  xl: "max-w-5xl" // 1024px - very wide content
};

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-slate-950/30", className)} {...props} />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: DialogSize }
>(({ size = "md", className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-6">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "flex w-full min-w-0 flex-col overflow-hidden rounded-card border bg-white shadow-xl outline-none",
          "max-h-[min(90vh,800px)]",
          DIALOG_SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-b px-5 py-4 pr-12", className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("themed-scroll min-h-0 flex-1 overflow-y-auto p-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 justify-end gap-2 border-t bg-slate-50 px-5 py-3", className)} {...props} />;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-base font-semibold text-slate-950", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("mt-1 text-sm leading-5 text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";
