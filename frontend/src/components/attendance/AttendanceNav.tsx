import { Link, useLocation } from "react-router-dom";
import { Button } from "../ui/button";

const links = [
  { label: "Records", to: "/attendance" },
  { label: "Calendar", to: "/attendance/calendar" },
  { label: "Corrections", to: "/attendance/corrections" },
  { label: "Devices", to: "/attendance/devices" },
  { label: "Reports", to: "/attendance/reports" },
  { label: "Settings", to: "/attendance/settings" }
];

export function AttendanceNav() {
  const location = useLocation();

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
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
