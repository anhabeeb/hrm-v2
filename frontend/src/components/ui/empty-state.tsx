import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex min-h-40 flex-col items-center justify-center gap-3 border-t bg-white p-8 text-center", className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
