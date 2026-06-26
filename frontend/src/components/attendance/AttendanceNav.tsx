import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api";
import { ModuleNavigationBar, ModuleNavigationItem } from "../ui/navigation-tabs";

const links = [
  { label: "Records", to: "/attendance", requiresModule: true },
  { label: "Calendar", to: "/attendance/calendar", requiresModule: true },
  { label: "Corrections", to: "/attendance/corrections", requiresModule: true },
  { label: "Devices", to: "/attendance/devices", requiresModule: false },
  { label: "Imports", to: "/attendance/imports", requiresModule: false },
  { label: "Mappings", to: "/attendance/biometric-mappings", requiresModule: false },
  { label: "Raw Logs", to: "/attendance/raw-logs", requiresModule: false },
  { label: "Diagnostics", to: "/attendance/device-diagnostics", requiresModule: false },
  { label: "Device Reports", to: "/attendance/device-reports", requiresModule: false },
  { label: "Reports", to: "/attendance/reports", requiresModule: true },
  { label: "Device Settings", to: "/attendance/devices/settings", requiresModule: false },
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
    <ModuleNavigationBar label="Attendance navigation">
      {links.filter((link) => moduleEnabled || !link.requiresModule).map((link) => {
        const active = link.to === "/attendance" ? location.pathname === "/attendance" || location.pathname === "/attendance/records" : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
        return (
          <ModuleNavigationItem key={link.to} to={link.to} active={active}>{link.label}</ModuleNavigationItem>
        );
      })}
    </ModuleNavigationBar>
  );
}
