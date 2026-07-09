import { useEffect, useState } from "react";
import { PageShell, SelectField, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollSettings } from "../types/payroll";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0">
      <div><h3 className="text-sm font-semibold text-slate-950">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function SubmoduleSection({ enabled, name, children }: { enabled: boolean; name: string; children: React.ReactNode }) {
  return (
    <fieldset disabled={!enabled} className={enabled ? undefined : "rounded-md bg-[#F7F7FB]/70 opacity-65"}>
      {!enabled ? <p className="mb-3 rounded-md border bg-white px-3 py-2 text-xs text-muted-foreground">{name} is disabled. These settings are visible for review but cannot be edited until the submodule is enabled.</p> : null}
      {children}
    </fieldset>
  );
}

export function PayrollSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.settings.view") || permissions.has("payroll.settings.manage") || permissions.has("payroll.submodules.view") || permissions.has("payroll.submodules.manage") || permissions.has("payroll.custom_deduction_settings.view") || permissions.has("payroll.custom_deduction_settings.manage") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.settings.manage") || permissions.has("payroll.custom_deduction_settings.update") || permissions.has("payroll.custom_deduction_settings.manage");
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      setSettings((await api.getPayrollSettings(token)).settings);
    } catch (err) {
      alerts.showApiError(err, "Unable to load payroll settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  function update<K extends keyof PayrollSettings>(key: K, value: PayrollSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updatePayrollSettings(token, settings)).settings);
      alerts.showSuccess("Settings saved", "Payroll settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save payroll settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={PAYROLL_NAV_ITEMS} moduleLabel="Payroll" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Payroll settings unavailable" description="Your account needs payroll settings permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  const moduleEnabled = Boolean(settings?.module_enabled ?? true);
  const attendanceModuleEnabled = user?.module_visibility?.attendance !== false;
  const disabled = !canManage || !moduleEnabled;

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={PAYROLL_NAV_ITEMS} moduleLabel="Payroll" />
                <p className="mt-0.5 text-xs text-muted-foreground">General payroll, bank-loan, pension, payment, and deduction-priority controls</p>
              </div>
              {canManage ? <Button size="sm" disabled={!moduleEnabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          <Panel className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-950">Final settlement status</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Exit Payroll / Final Settlement and per-module enablement are managed from the main Settings hub, not duplicated here.</p>
              </div>
              <Badge tone="neutral">Managed separately</Badge>
            </div>
          </Panel>

          {loading || !settings ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : (
            <Panel className="space-y-5 p-4">
              <Section title="General payroll" description="Base calculation and module switches.">
                {!attendanceModuleEnabled ? (
                  <div className="rounded-md border bg-[#FAEEDA] px-3 py-2 text-xs text-[#854F0B] md:col-span-2 xl:col-span-3">
                    Attendance module is disabled. Payroll will not use attendance records, late penalties, absences, missed punches, or attendance-based days worked.
                  </div>
                ) : null}
                <div className="space-y-1.5"><Label>Default currency</Label><Input disabled={disabled} value={settings.default_currency} onChange={(e) => update("default_currency", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Daily rate mode</Label><SelectField disabled={disabled} value={settings.default_daily_rate_mode} onValueChange={(v) => update("default_daily_rate_mode", v as PayrollSettings["default_daily_rate_mode"])}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option><option value="FIXED_30_DAYS">Fixed 30 days</option></SelectField></div>
                <div className="space-y-1.5"><Label>Payment day</Label><Input disabled={disabled} type="number" min={1} max={31} value={settings.default_salary_payment_day ?? ""} onChange={(e) => update("default_salary_payment_day", e.target.value ? Number(e.target.value) : null)} /></div>
                <CheckboxField disabled={disabled} label="Allow negative net salary" checked={Boolean(settings.allow_negative_net_salary)} onChange={(v) => update("allow_negative_net_salary", v)} />
                <CheckboxField disabled={disabled} label="Require approval before paid" checked={Boolean(settings.require_approval_before_paid)} onChange={(v) => update("require_approval_before_paid", v)} />
                <CheckboxField disabled={disabled || !attendanceModuleEnabled} label="Include attendance deductions" checked={Boolean(settings.include_attendance_deductions) && attendanceModuleEnabled} onChange={(v) => update("include_attendance_deductions", v)} />
                <CheckboxField disabled={disabled} label="Include leave deductions" checked={Boolean(settings.include_leave_deductions)} onChange={(v) => update("include_leave_deductions", v)} />
                <CheckboxField disabled={disabled || !Boolean(settings.employee_advances_enabled ?? true)} label="Include advance deductions" checked={Boolean(settings.include_advance_deductions)} onChange={(v) => update("include_advance_deductions", v)} />
                <CheckboxField disabled={disabled} label="Include roster scheduled days" checked={Boolean(settings.include_roster_scheduled_days)} onChange={(v) => update("include_roster_scheduled_days", v)} />
              </Section>

              <SubmoduleSection enabled={Boolean(settings.bank_loan_deductions_enabled ?? true)} name="Bank loan deductions">
                <Section title="Bank loan deductions" description="Salary-deduction behavior for bank loans and cash-salary eligibility.">
                  <CheckboxField disabled label="Enable bank loan deductions" checked={Boolean(settings.bank_loan_deductions_enabled ?? true)} onChange={() => undefined} />
                  <CheckboxField disabled={disabled} label="Allow multiple bank loans per employee" checked={Boolean(settings.allow_multiple_bank_loans_per_employee ?? true)} onChange={(v) => update("allow_multiple_bank_loans_per_employee", v)} />
                  <CheckboxField disabled={disabled} label="Require loan approval before deduction" checked={Boolean(settings.require_loan_approval_before_payroll_deduction ?? true)} onChange={(v) => update("require_loan_approval_before_payroll_deduction", v)} />
                  <CheckboxField disabled={disabled} label="Allow partial loan deduction" checked={Boolean(settings.allow_partial_loan_deduction ?? true)} onChange={(v) => update("allow_partial_loan_deduction", v)} />
                  <CheckboxField disabled={disabled} label="Block payroll if loan exceeds net salary" checked={Boolean(settings.block_payroll_if_loan_exceeds_net_salary)} onChange={(v) => update("block_payroll_if_loan_exceeds_net_salary", v)} />
                  <div className="space-y-1.5"><Label>Insufficient salary mode</Label><SelectField disabled={disabled} value={settings.bank_loan_insufficient_salary_mode ?? "REQUIRE_OVERRIDE"} onValueChange={(v) => update("bank_loan_insufficient_salary_mode", v)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField></div>
                  <CheckboxField disabled={disabled} label="Enable minimum net salary protection" checked={Boolean(settings.bank_loan_minimum_net_salary_protection_enabled)} onChange={(v) => update("bank_loan_minimum_net_salary_protection_enabled", v)} />
                  <div className="space-y-1.5"><Label>Minimum net threshold type</Label><SelectField disabled={disabled} value={settings.bank_loan_minimum_net_salary_threshold_type ?? "FIXED_AMOUNT"} onValueChange={(v) => update("bank_loan_minimum_net_salary_threshold_type", v)}><option value="FIXED_AMOUNT">Fixed amount</option><option value="PERCENTAGE_OF_NET_SALARY">Percentage of net salary</option></SelectField></div>
                  <div className="space-y-1.5"><Label>Minimum net threshold %</Label><Input disabled={disabled} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_percentage ?? 0} onChange={(e) => update("bank_loan_minimum_net_salary_threshold_percentage", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Minimum net threshold amount</Label><Input disabled={disabled} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_amount ?? 0} onChange={(e) => update("bank_loan_minimum_net_salary_threshold_amount", Number(e.target.value))} /></div>
                  <CheckboxField disabled={disabled} label="Skip loan if below threshold" checked={Boolean(settings.bank_loan_skip_if_below_threshold_enabled ?? true)} onChange={(v) => update("bank_loan_skip_if_below_threshold_enabled", v)} />
                  <CheckboxField disabled={disabled} label="Require bank notification on skip" checked={Boolean(settings.bank_loan_bank_notification_required_on_skip ?? true)} onChange={(v) => update("bank_loan_bank_notification_required_on_skip", v)} />
                  <CheckboxField disabled={disabled} label="Enable direct collection status" checked={Boolean(settings.bank_loan_employee_direct_collection_status_enabled ?? true)} onChange={(v) => update("bank_loan_employee_direct_collection_status_enabled", v)} />
                  <div className="space-y-1.5"><Label>Loan deduction priority</Label><Input disabled={disabled} type="number" min={0} value={settings.loan_deduction_priority ?? 2} onChange={(e) => update("loan_deduction_priority", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Minimum statement months</Label><Input disabled={disabled} type="number" min={0} value={settings.bank_loan_statement_months_required_min ?? 6} onChange={(e) => update("bank_loan_statement_months_required_min", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Default statement months</Label><Input disabled={disabled} type="number" min={0} value={settings.bank_loan_statement_months_required_default ?? 12} onChange={(e) => update("bank_loan_statement_months_required_default", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Default salary slips months</Label><Input disabled={disabled} type="number" min={0} value={settings.bank_loan_salary_slips_months_required_default ?? 6} onChange={(e) => update("bank_loan_salary_slips_months_required_default", Number(e.target.value))} /></div>
                  <CheckboxField disabled={disabled} label="Show loan details in self-service" checked={Boolean(settings.show_loan_details_in_self_service ?? true)} onChange={(v) => update("show_loan_details_in_self_service", v)} />
                  <CheckboxField disabled={disabled} label="Show loan details on payslip" checked={Boolean(settings.show_loan_details_on_payslip ?? true)} onChange={(v) => update("show_loan_details_on_payslip", v)} />
                  <CheckboxField disabled={disabled} label="Require bank salary route by default" checked={Boolean(settings.bank_loan_requires_bank_salary_route_default ?? true)} onChange={(v) => update("bank_loan_requires_bank_salary_route_default", v)} />
                  <CheckboxField disabled={disabled} label="Cash salary default ineligible" checked={Boolean(settings.bank_loan_cash_salary_default_ineligible ?? true)} onChange={(v) => update("bank_loan_cash_salary_default_ineligible", v)} />
                  <CheckboxField disabled={disabled} label="Allow cash employee override" checked={Boolean(settings.bank_loan_allow_cash_employee_override ?? true)} onChange={(v) => update("bank_loan_allow_cash_employee_override", v)} />
                  <CheckboxField disabled={disabled} label="Override requires reason" checked={Boolean(settings.bank_loan_override_requires_reason ?? true)} onChange={(v) => update("bank_loan_override_requires_reason", v)} />
                  <CheckboxField disabled={disabled} label="Override requires document" checked={Boolean(settings.bank_loan_override_requires_document ?? true)} onChange={(v) => update("bank_loan_override_requires_document", v)} />
                </Section>
              </SubmoduleSection>

              <SubmoduleSection enabled={Boolean(settings.custom_deductions_enabled ?? true)} name="Custom deductions">
                <Section title="Custom deduction settings" description="Employer-defined payroll deductions after pension and bank loan priorities, with payslip, self-service, and shortfall controls.">
                  <CheckboxField disabled label="Enable custom deductions" checked={Boolean(settings.custom_deductions_enabled ?? true)} onChange={() => undefined} />
                  <CheckboxField disabled={disabled} label="Require approval before payroll deduction" checked={Boolean(settings.require_custom_deduction_approval ?? true)} onChange={(v) => update("require_custom_deduction_approval", v)} />
                  <CheckboxField disabled={disabled} label="Show on payslip by default" checked={Boolean(settings.custom_deduction_show_on_payslip_default ?? true)} onChange={(v) => update("custom_deduction_show_on_payslip_default", v)} />
                  <CheckboxField disabled={disabled} label="Show in self-service by default" checked={Boolean(settings.custom_deduction_show_in_self_service_default ?? true)} onChange={(v) => update("custom_deduction_show_in_self_service_default", v)} />
                  <CheckboxField disabled={disabled} label="Include in final settlement by default" checked={Boolean(settings.custom_deduction_include_in_final_settlement_default ?? true)} onChange={(v) => update("custom_deduction_include_in_final_settlement_default", v)} />
                  <CheckboxField disabled={disabled} label="Allow partial deduction" checked={Boolean(settings.custom_deduction_allow_partial_deduction ?? true)} onChange={(v) => update("custom_deduction_allow_partial_deduction", v)} />
                  <CheckboxField disabled={disabled} label="Carry forward shortfalls" checked={Boolean(settings.custom_deduction_shortfall_carry_forward_enabled)} onChange={(v) => update("custom_deduction_shortfall_carry_forward_enabled", v)} />
                  <CheckboxField disabled={disabled} label="Reason required for cancel" checked={Boolean(settings.custom_deduction_require_reason_for_cancel ?? true)} onChange={(v) => update("custom_deduction_require_reason_for_cancel", v)} />
                  <CheckboxField disabled={disabled} label="Require document for sensitive categories" checked={Boolean(settings.custom_deduction_require_document_for_sensitive_categories)} onChange={(v) => update("custom_deduction_require_document_for_sensitive_categories", v)} />
                  <div className="space-y-1.5"><Label>Insufficient salary mode</Label><SelectField disabled={disabled} value={settings.custom_deduction_insufficient_salary_mode ?? "WARN_ONLY"} onValueChange={(v) => update("custom_deduction_insufficient_salary_mode", v)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField></div>
                  <div className="space-y-1.5"><Label>Default priority</Label><Input disabled={disabled} type="number" min={0} value={settings.custom_deduction_priority_default ?? 3} onChange={(e) => update("custom_deduction_priority_default", Number(e.target.value))} /></div>
                </Section>
              </SubmoduleSection>

              <SubmoduleSection enabled={Boolean(settings.pension_enabled ?? true)} name="Pension">
                <Section title="Pension settings" description="Automatic employee deductions and employer company-cost contributions.">
                  <CheckboxField disabled label="Enable pension" checked={Boolean(settings.pension_enabled ?? true)} onChange={() => undefined} />
                  <CheckboxField disabled={disabled} label="Auto-calculate pension" checked={Boolean(settings.pension_auto_calculation_enabled ?? true)} onChange={(v) => update("pension_auto_calculation_enabled", v)} />
                  <div className="space-y-1.5"><Label>Default pension scheme ID</Label><Input disabled={disabled} value={settings.default_pension_scheme_id ?? ""} onChange={(e) => update("default_pension_scheme_id", e.target.value || null)} /></div>
                  <div className="space-y-1.5"><Label>Employee contribution %</Label><Input disabled={disabled} type="number" min={0} step="0.01" value={settings.pension_employee_contribution_default_percent ?? 7} onChange={(e) => update("pension_employee_contribution_default_percent", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Employer contribution %</Label><Input disabled={disabled} type="number" min={0} step="0.01" value={settings.pension_employer_contribution_default_percent ?? 7} onChange={(e) => update("pension_employer_contribution_default_percent", Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label>Pension basis</Label><SelectField disabled={disabled} value={settings.pension_basis_default ?? "BASIC_SALARY_ONLY"} onValueChange={(v) => update("pension_basis_default", v)}><option value="BASIC_SALARY_ONLY">Basic salary only</option><option value="GROSS_SALARY">Gross salary</option><option value="CUSTOM_FORMULA_PLACEHOLDER">Custom formula placeholder</option></SelectField></div>
                  <CheckboxField disabled={disabled} label="Show pension on payslip" checked={Boolean(settings.pension_show_on_payslip ?? true)} onChange={(v) => update("pension_show_on_payslip", v)} />
                  <CheckboxField disabled={disabled} label="Show pension in self-service" checked={Boolean(settings.pension_show_in_self_service ?? true)} onChange={(v) => update("pension_show_in_self_service", v)} />
                  <CheckboxField disabled={disabled} label="Enable pension remittance" checked={Boolean(settings.pension_remittance_enabled ?? true)} onChange={(v) => update("pension_remittance_enabled", v)} />
                  <CheckboxField disabled={disabled} label="Employer can pay employee share" checked={Boolean(settings.pension_employer_can_pay_employee_share ?? true)} onChange={(v) => update("pension_employer_can_pay_employee_share", v)} />
                  <CheckboxField disabled={disabled} label="Foreign employee pension default enabled" checked={Boolean(settings.foreign_employee_pension_default_enabled)} onChange={(v) => update("foreign_employee_pension_default_enabled", v)} />
                  <CheckboxField disabled={disabled} label="Foreign voluntary enrollment enabled" checked={Boolean(settings.foreign_employee_voluntary_enrollment_enabled ?? true)} onChange={(v) => update("foreign_employee_voluntary_enrollment_enabled", v)} />
                </Section>
              </SubmoduleSection>

              <SubmoduleSection enabled={Boolean(settings.payment_methods_enabled ?? true)} name="Employee payment methods">
                <Section title="Payment / cash salary settings" description="Cash salary acknowledgement foundation.">
                  <CheckboxField disabled={disabled} label="Enable cash salary acknowledgement" checked={Boolean(settings.cash_salary_acknowledgement_enabled)} onChange={(v) => update("cash_salary_acknowledgement_enabled", v)} />
                  <CheckboxField disabled={disabled} label="Require acknowledgement before finalize" checked={Boolean(settings.cash_salary_acknowledgement_required_before_finalize)} onChange={(v) => update("cash_salary_acknowledgement_required_before_finalize", v)} />
                  <CheckboxField disabled={disabled} label="Enable signature capture placeholder" checked={Boolean(settings.cash_salary_signature_capture_placeholder_enabled)} onChange={(v) => update("cash_salary_signature_capture_placeholder_enabled", v)} />
                </Section>
              </SubmoduleSection>

              <Section title="Deduction priority" description="JSON order used by calculation foundations.">
                <div className="md:col-span-2 xl:col-span-3 space-y-1.5">
                  <Label>payroll_deduction_priority_json</Label>
                  <textarea disabled={disabled} className="min-h-24 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs disabled:opacity-60" value={settings.payroll_deduction_priority_json ?? ""} onChange={(e) => update("payroll_deduction_priority_json", e.target.value)} />
                </div>
              </Section>
            </Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
