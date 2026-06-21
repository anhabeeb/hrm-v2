import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/button";

const links = [
  { label: "Weekly", to: "/roster", permission: "roster.view" },
  { label: "Shift Templates", to: "/roster/shift-templates", permission: "roster.view" },
  { label: "Reports", to: "/roster/reports", permission: "roster.reports.view" },
  { label: "Settings", to: "/roster/settings", permission: "roster.view" }
];

export function RosterNav() {
  const location = useLocation();
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);

  return (
    <div className="flex flex-wrap gap-2">
      {links.filter((link) => permissions.has(link.permission)).map((link) => {
        const active = link.to === "/roster" ? location.pathname === "/roster" || location.pathname === "/roster/weekly" : location.pathname === link.to;
        return (
          <Link key={link.to} to={link.to}>
            <Button variant={active ? "primary" : "outline"} size="sm">{link.label}</Button>
          </Link>
        );
      })}
    </div>
  );
}
