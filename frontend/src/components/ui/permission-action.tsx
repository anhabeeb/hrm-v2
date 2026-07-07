import type { ReactNode } from "react";
import { Button, type ButtonSize } from "./button";

// Permission-adaptive action button: the same real-world action (approve a
// request, correct a record, change a profile field) renders as a direct,
// immediate-effect button for a viewer who holds approval authority for that
// specific step, or a "Request X" button that queues it for someone else when
// they don't. Two call shapes exist in the approved design and both use this:
//   1. Not-yet-initiated actions (e.g. "Request correction" vs "Edit record"
//      on an attendance day that has no pending request yet).
//   2. Already-pending items in an approver's list (e.g. Leave requests —
//      `canApprove` true shows direct Approve/Reject; false and the viewer
//      has no relationship to this request should render nothing here, since
//      there's no action for them to take — this component is for the cases
//      in between, where a request-style affordance genuinely applies).
// Never hide the direct action without showing a complementary request
// affordance in its place when one is actionable for the current viewer.

export interface PermissionAdaptiveActionProps {
  hasAuthority: boolean;
  directLabel: ReactNode;
  directIcon?: ReactNode;
  onDirectAction: () => void;
  requestLabel: ReactNode;
  requestIcon?: ReactNode;
  onRequestAction: () => void;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}

export function PermissionAdaptiveAction({
  hasAuthority,
  directLabel,
  directIcon,
  onDirectAction,
  requestLabel,
  requestIcon,
  onRequestAction,
  size = "md",
  disabled,
  className
}: PermissionAdaptiveActionProps) {
  if (hasAuthority) {
    return (
      <Button variant="actionSave" size={size} disabled={disabled} className={className} onClick={onDirectAction}>
        {directIcon}
        {directLabel}
      </Button>
    );
  }
  return (
    <Button variant="actionNeutral" size={size} disabled={disabled} className={className} onClick={onRequestAction}>
      {requestIcon}
      {requestLabel}
    </Button>
  );
}
