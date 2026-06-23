import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { Button } from "../ui/button";

const links: Array<{ label: string; to: string; permissions: string[] }> = [
  { label: "Weekly", to: "/roster", permissions: ["roster.view", "roster.team.view", "roster.assignments.view"] },
  { label: "Shift Templates", to: "/roster/shift-templates", permissions: ["roster.shift_templates.view", "roster.shift_templates.manage", "roster.settings.manage", "roster.view"] },
  { label: "Reports", to: "/roster/reports", permissions: ["roster.reports.view"] },
  { label: "Settings", to: "/roster/settings", permissions: ["roster.settings.view", "roster.settings.update", "roster.settings.manage", "roster.view"] }
];

export function RosterNav() {
  const location = useLocation();
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const [moduleEnabled, setModuleEnabled] = useState(true);

  useEffect(() => {
    if (!token || !links.some((link) => link.permissions.some((permission) => permissions.has(permission)))) return;
    api.getRosterSettings(token)
      .then((result) => setModuleEnabled(result.settings.module_enabled !== false && result.settings.module_enabled !== 0))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "ROSTER_MODULE_DISABLED") setModuleEnabled(false);
      });
  }, [token, user?.permissions]);

  return (
    <div className="flex flex-wrap gap-2">
      {links.filter((link) => link.permissions.some((permission) => permissions.has(permission))).filter((link) => moduleEnabled || link.to === "/roster/settings").map((link) => {
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
