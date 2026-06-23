import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api";
import { Button } from "../ui/button";

const links = [
  { label: "Records", to: "/attendance", requiresModule: true },
  { label: "Calendar", to: "/attendance/calendar", requiresModule: true },
  { label: "Corrections", to: "/attendance/corrections", requiresModule: true },
  { label: "Devices", to: "/attendance/devices", requiresModule: false },
  { label: "Reports", to: "/attendance/reports", requiresModule: true },
  { label: "Settings", to: "/attendance/settings", requiresModule: false }
];

export function AttendanceNav() {
  const location = useLocation();
  const { token } = useAuth();
  const [moduleEnabled, setModuleEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadModuleState() {
      if (!token) return;
      try {
        const result = await api.getAttendanceSettings(token);
        if (mounted) setModuleEnabled(Boolean(result.settings.module_enabled));
      } catch {
        if (mounted) setModuleEnabled(true);
      }
    }
    void loadModuleState();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="flex flex-wrap gap-2">
      {links.filter((link) => moduleEnabled || !link.requiresModule).map((link) => {
        const active = link.to === "/attendance" ? location.pathname === "/attendance" || location.pathname === "/attendance/records" : location.pathname === link.to;
        return (
          <Link key={link.to} to={link.to}>
            <Button variant={active ? "primary" : "outline"} size="sm">{link.label}</Button>
          </Link>
        );
      })}
    </div>
  );
}
