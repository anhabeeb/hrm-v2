import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api";
import type { PayrollSettings } from "../../types/payroll";
import { ModuleNavigationBar, ModuleNavigationItem } from "../ui/navigation-tabs";

type PayrollSubmoduleSettingKey =
  | "payslips_enabled"
  | "payment_register_enabled"
  | "payment_methods_enabled"
  | "payment_institutions_enabled"
  | "employee_advances_enabled"
  | "payroll_adjustments_enabled"
  | "payroll_reports_enabled"
  | "bank_loan_deductions_enabled"
  | "custom_deductions_enabled"
  | "pension_enabled";

const links = [
  { label: "Dashboard", to: "/payroll", permission: "payroll.view" },
  { label: "Periods", to: "/payroll/periods", permission: "payroll.periods.view", fallback: "payroll.view" },
  { label: "Runs", to: "/payroll/runs", permission: "payroll.runs.view", fallback: "payroll.view" },
  { label: "Advances", to: "/payroll/advances", permission: "payroll.advances.view", submodule: "employee_advances_enabled" },
  { label: "Deductions", to: "/payroll/deductions", permission: "payroll.deductions.view", fallback: "payroll.view" },
  { label: "Adjustments", to: "/payroll/adjustments", permission: "payroll.adjustments.view", fallback: "payroll.view", submodule: "payroll_adjustments_enabled" },
  { label: "Components", to: "/payroll/components", permission: "payroll.components.view", fallback: "payroll.view" },
  { label: "Payslips", to: "/payroll/payslips", permission: "payroll.payslips.view", fallback: "payroll.view", submodule: "payslips_enabled" },
  { label: "Payment Register", to: "/payroll/payment-register", permission: "payroll.payment_register.view", fallback: "payroll.view", submodule: "payment_register_enabled" },
  { label: "Payment Institutions", to: "/payroll/payment-institutions", permission: "payroll.payment_institutions.view", fallback: "payroll.payment_institutions.manage", submodule: "payment_institutions_enabled" },
  { label: "Bank Loans", to: "/payroll/bank-loans", permission: "payroll.bank_loans.view", fallback: "payroll.bank_loans.manage", submodule: "bank_loan_deductions_enabled" },
  { label: "Custom Deductions", to: "/payroll/custom-deductions", permission: "payroll.employee_custom_deductions.view", fallback: "payroll.employee_custom_deductions.manage", submodule: "custom_deductions_enabled" },
  { label: "Pension", to: "/payroll/pension", permission: "payroll.pension_contributions.view", fallback: "payroll.pension_schemes.view", submodule: "pension_enabled" },
  { label: "History", to: "/payroll/history", permission: "payroll.history.view", fallback: "payroll.reports.view" },
  { label: "Exit Payroll", to: "/payroll/exit-payroll", permission: "final_settlement.view", fallback: "final_settlement.cases.view" },
  { label: "Reports", to: "/payroll/reports", permission: "payroll.reports.view", fallback: "reports.payroll.view", submodule: "payroll_reports_enabled" }
] satisfies Array<{ label: string; to: string; permission: string; fallback?: string; submodule?: PayrollSubmoduleSettingKey }>;

export function PayrollNav() {
  const location = useLocation();
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getPayrollSettings(token)
      .then((result) => { if (!cancelled) setSettings(result.settings); })
      .catch(() => { if (!cancelled) setSettings(null); });
    return () => { cancelled = true; };
  }, [token]);

  function submoduleVisible(key?: PayrollSubmoduleSettingKey) {
    if (!key || !settings) return true;
    return Boolean(settings.module_enabled ?? true) && Boolean(settings[key] ?? true);
  }

  return (
    <ModuleNavigationBar label="Payroll navigation">
      {links.filter((link) => submoduleVisible(link.submodule) && (permissions.has(link.permission) || Boolean(link.fallback && permissions.has(link.fallback)))).map((link) => {
        const active = link.to === "/payroll" ? location.pathname === "/payroll" : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
        return (
          <ModuleNavigationItem key={link.to} to={link.to} active={active}>{link.label}</ModuleNavigationItem>
        );
      })}
    </ModuleNavigationBar>
  );
}
