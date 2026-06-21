import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/button";

const links = [
  { label: "Dashboard", to: "/payroll", permission: "payroll.view" },
  { label: "Periods", to: "/payroll/periods", permission: "payroll.view" },
  { label: "Runs", to: "/payroll/runs", permission: "payroll.view" },
  { label: "Advances", to: "/payroll/advances", permission: "payroll.advances.view" },
  { label: "Deductions", to: "/payroll/deductions", permission: "payroll.manage" },
  { label: "Adjustments", to: "/payroll/adjustments", permission: "payroll.adjustments.manage" },
  { label: "Components", to: "/payroll/components", permission: "payroll.components.manage" },
  { label: "Reports", to: "/payroll/reports", permission: "payroll.reports.view" },
  { label: "Settings", to: "/payroll/settings", permission: "payroll.settings.manage" },
  { label: "Final Settlements", to: "/payroll/final-settlements", permission: "payroll.manage" }
];

export function PayrollNav() {
  const location = useLocation();
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);

  return (
    <div className="flex flex-wrap gap-2">
      {links.filter((link) => permissions.has(link.permission)).map((link) => {
        const active = link.to === "/payroll" ? location.pathname === "/payroll" : location.pathname === link.to;
        return (
          <Link key={link.to} to={link.to}>
            <Button variant={active ? "primary" : "outline"} size="sm">{link.label}</Button>
          </Link>
        );
      })}
    </div>
  );
}
