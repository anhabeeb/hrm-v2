import { BookOpenCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../hooks/useAuth";
import { contextualHelpTargets } from "./adminHelpTargets";

type HelpTarget = keyof typeof contextualHelpTargets;

type HelpUser = {
  is_owner?: boolean;
  permissions?: string[];
} | null;

export function canAccessAdminHelp(user: HelpUser) {
  return Boolean(user?.is_owner || user?.permissions?.includes("admin.help.view") || user?.permissions?.includes("admin.help.manage"));
}

export function AdminHelpLink({ target, label = "View guide", className }: { target: HelpTarget; label?: string; className?: string }) {
  const { user } = useAuth();

  if (!canAccessAdminHelp(user)) {
    return null;
  }

  const sectionId = contextualHelpTargets[target];

  return (
    <Link to={`/admin/help#${sectionId}`} className={className} title={label}>
      <Button variant="outline" size="sm">
        <BookOpenCheck className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );
}
