import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/button";

const links = [
  { label: "Dashboard", to: "/payroll", permission: "payroll.view" },
  { label: "Periods", to: "/payroll/periods", permission: "payroll.periods.view", fallback: "payroll.view" },
  { label: "Runs", to: "/payroll/runs", permission: "payroll.runs.view", fallback: "payroll.view" },
  { label: "Advances", to: "/payroll/advances", permission: "payroll.advances.view" },
  { label: "Deductions", to: "/payroll/deductions", permission: "payroll.deductions.view", fallback: "payroll.view" },
  { label: "Adjustments", to: "/payroll/adjustments", permission: "payroll.adjustments.view", fallback: "payroll.view" },
  { label: "Components", to: "/payroll/components", permission: "payroll.components.view", fallback: "payroll.view" },
  { label: "Payslips", to: "/payroll/payslips", permission: "payroll.payslips.view", fallback: "payroll.view" },
  { label: "Payment Register", to: "/payroll/payment-register", permission: "payroll.payment_register.view", fallback: "payroll.view" },
  { label: "Payment Institutions", to: "/payroll/payment-institutions", permission: "payroll.payment_institutions.view", fallback: "payroll.payment_institutions.manage" },
  { label: "Bank Loans", to: "/payroll/bank-loans", permission: "payroll.bank_loans.view", fallback: "payroll.bank_loans.manage" },
  { label: "Custom Deductions", to: "/payroll/custom-deductions", permission: "payroll.employee_custom_deductions.view", fallback: "payroll.employee_custom_deductions.manage" },
  { label: "Pension", to: "/payroll/pension", permission: "payroll.pension_contributions.view", fallback: "payroll.pension_schemes.view" },
  { label: "History", to: "/payroll/history", permission: "payroll.history.view", fallback: "payroll.reports.view" },
  { label: "Exit Payroll", to: "/payroll/exit-payroll", permission: "final_settlement.view", fallback: "final_settlement.cases.view" },
  { label: "Reports", to: "/payroll/reports", permission: "payroll.reports.view", fallback: "reports.payroll.view" },
  { label: "Settings", to: "/payroll/settings", permission: "payroll.settings.view", fallback: "payroll.settings.manage" }
];

export function PayrollNav() {
  const location = useLocation();
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);

  return (
    <div className="flex flex-wrap gap-2">
      {links.filter((link) => permissions.has(link.permission) || Boolean(link.fallback && permissions.has(link.fallback))).map((link) => {
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
