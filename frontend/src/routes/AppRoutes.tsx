import { lazy, Suspense, type ComponentType, type ReactElement } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { AppLoader, PageLoader } from "../components/loading";
import { Button } from "../components/ui/button";
import { ModuleDisabledState } from "../components/ui/page-shell";
import { APP_BRANDING } from "../config/branding";
import { useAuth } from "../hooks/useAuth";
import { AppShell } from "../layouts/AppShell";
import { measureAsync } from "../lib/performanceDiagnostics";
import { registerRoutePreloader } from "../lib/routePreload";

type LazyPageComponent = ComponentType<any> & { preload?: () => Promise<unknown> };

function lazyPage(loader: () => Promise<Record<string, unknown>>, exportName: string) {
  let loadPromise: Promise<{ default: ComponentType<any> }> | null = null;
  const load = () => {
    loadPromise ??= measureAsync(`route chunk ${exportName}`, async () => ({ default: (await loader())[exportName] as ComponentType<any> }));
    return loadPromise;
  };
  const Page = lazy(load) as LazyPageComponent;
  Page.preload = () => load();
  return Page;
}

const AttendanceCalendarPage = lazyPage(() => import("../pages/AttendanceCalendarPage"), "AttendanceCalendarPage");
const AttendanceCorrectionsPage = lazyPage(() => import("../pages/AttendanceCorrectionsPage"), "AttendanceCorrectionsPage");
const AttendanceDevicesPage = lazyPage(() => import("../pages/AttendanceDevicesPage"), "AttendanceDevicesPage");
const AttendanceDeviceOperationsPage = lazyPage(() => import("../pages/AttendanceDeviceOperationsPage"), "AttendanceDeviceOperationsPage");
const AttendanceRecordsPage = lazyPage(() => import("../pages/AttendanceRecordsPage"), "AttendanceRecordsPage");
const AttendanceReportsPage = lazyPage(() => import("../pages/AttendanceReportsPage"), "AttendanceReportsPage");
const AttendanceSettingsPage = lazyPage(() => import("../pages/AttendanceSettingsPage"), "AttendanceSettingsPage");
const AdminHelpGuidePage = lazyPage(() => import("../pages/AdminHelpGuidePage"), "AdminHelpGuidePage");
const AdminSettingsPage = lazyPage(() => import("../pages/AdminSettingsPage"), "AdminSettingsPage");
const ApprovalsPage = lazyPage(() => import("../pages/ApprovalsPage"), "ApprovalsPage");
const AssetAssignmentsPage = lazyPage(() => import("../pages/AssetAssignmentsPage"), "AssetAssignmentsPage");
const AssetSettingsPage = lazyPage(() => import("../pages/AssetSettingsPage"), "AssetSettingsPage");
const AssetUniformSettingsPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "AssetUniformSettingsPage");
const AssetsDashboardPage = lazyPage(() => import("../pages/AssetsDashboardPage"), "AssetsDashboardPage");
const AssetsItemsPage = lazyPage(() => import("../pages/AssetsItemsPage"), "AssetsItemsPage");
const AssetsReportsPage = lazyPage(() => import("../pages/AssetsReportsPage"), "AssetsReportsPage");
const UniformAssignmentsPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformAssignmentsPage");
const UniformInventoryPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformInventoryPage");
const UniformTypesPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformTypesPage");
const AuditLogPage = lazyPage(() => import("../pages/AuditLogPage"), "AuditLogPage");
const ContractsPage = lazyPage(() => import("../pages/ContractsPage"), "ContractsPage");
const DashboardPage = lazyPage(() => import("../pages/DashboardPage"), "DashboardPage");
const DataTransferPage = lazyPage(() => import("../pages/DataTransferPage"), "DataTransferPage");
const DocumentCompliancePage = lazyPage(() => import("../pages/DocumentCompliancePage"), "DocumentCompliancePage");
const DocumentRegistryPage = lazyPage(() => import("../pages/DocumentRegistryPage"), "DocumentRegistryPage");
const DocumentSettingsPage = lazyPage(() => import("../pages/DocumentSettingsPage"), "DocumentSettingsPage");
const EmployeeNotesSettingsPage = lazyPage(() => import("../pages/EmployeeNotesSettingsPage"), "EmployeeNotesSettingsPage");
const EmployeeProfilePage = lazyPage(() => import("../pages/EmployeeProfilePage"), "EmployeeProfilePage");
const EmployeeSettingsPage = lazyPage(() => import("../pages/EmployeeSettingsPage"), "EmployeeSettingsPage");
const EmployeesPage = lazyPage(() => import("../pages/EmployeesPage"), "EmployeesPage");
const FinalSettlementPage = lazyPage(() => import("../pages/FinalSettlementPage"), "FinalSettlementPage");
const ImportMigrationPage = lazyPage(() => import("../pages/ImportMigrationPage"), "ImportMigrationPage");
const KycRequestsPage = lazyPage(() => import("../pages/KycRequestsPage"), "KycRequestsPage");
const LeaveCalendarPage = lazyPage(() => import("../pages/LeaveCalendarPage"), "LeaveCalendarPage");
const LeaveRequestsPage = lazyPage(() => import("../pages/LeaveRequestsPage"), "LeaveRequestsPage");
const LeaveSettingsPage = lazyPage(() => import("../pages/LeaveSettingsPage"), "LeaveSettingsPage");
const LifecyclePage = lazyPage(() => import("../pages/LifecyclePage"), "LifecyclePage");
const LoginPage = lazyPage(() => import("../pages/LoginPage"), "LoginPage");
const MissingDocumentsPage = lazyPage(() => import("../pages/MissingDocumentsPage"), "MissingDocumentsPage");
const NotificationCenterPage = lazyPage(() => import("../pages/NotificationCenterPage"), "NotificationCenterPage");
const OrganizationSettingsPage = lazyPage(() => import("../pages/OrganizationSettingsPage"), "OrganizationSettingsPage");
const PayrollAdjustmentsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollAdjustmentsPage");
const PayrollAdvancesPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollAdvancesPage");
const PayrollComponentsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollComponentsPage");
const PayrollDeductionsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollDeductionsPage");
const PayrollReportsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollReportsPage");
const PayrollSettingsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollSettingsPage");
const PayrollDashboardPage = lazyPage(() => import("../pages/PayrollDashboardPage"), "PayrollDashboardPage");
const PayrollBankLoansPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollBankLoansPage");
const PayrollCustomDeductionsPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollCustomDeductionsPage");
const PayrollPaymentInstitutionsPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollPaymentInstitutionsPage");
const PayrollPensionPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollPensionPage");
const PayrollPeriodsPage = lazyPage(() => import("../pages/PayrollPeriodsPage"), "PayrollPeriodsPage");
const PayrollHistoryPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollHistoryPage");
const PayrollPaymentRegisterPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollPaymentRegisterPage");
const PayrollPayslipsPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollPayslipsPage");
const PayrollRunDetailPage = lazyPage(() => import("../pages/PayrollRunDetailPage"), "PayrollRunDetailPage");
const PayrollRunsPage = lazyPage(() => import("../pages/PayrollRunsPage"), "PayrollRunsPage");
const PlaceholderModulePage = lazyPage(() => import("../pages/PlaceholderModulePage"), "PlaceholderModulePage");
const ReportsPage = lazyPage(() => import("../pages/ReportsPage"), "ReportsPage");
const RosterReportsPage = lazyPage(() => import("../pages/RosterReportsPage"), "RosterReportsPage");
const RosterSettingsPage = lazyPage(() => import("../pages/RosterSettingsPage"), "RosterSettingsPage");
const RosterShiftTemplatesPage = lazyPage(() => import("../pages/RosterShiftTemplatesPage"), "RosterShiftTemplatesPage");
const RosterWeeklyPage = lazyPage(() => import("../pages/RosterWeeklyPage"), "RosterWeeklyPage");
const SelfServicePage = lazyPage(() => import("../pages/SelfServicePage"), "SelfServicePage");
const SelfServiceSettingsPage = lazyPage(() => import("../pages/SelfServiceSettingsPage"), "SelfServiceSettingsPage");
const SearchResultsPage = lazyPage(() => import("../pages/SearchResultsPage"), "SearchResultsPage");
const SettingsPage = lazyPage(() => import("../pages/SettingsPage"), "SettingsPage");
const SetupPage = lazyPage(() => import("../pages/SetupPage"), "SetupPage");
const UsersAccessPage = lazyPage(() => import("../pages/UsersAccessPage"), "UsersAccessPage");

registerRoutePreloader("employee-profile", () => EmployeeProfilePage.preload?.() ?? Promise.resolve());
registerRoutePreloader("onboarding-case", () => LifecyclePage.preload?.() ?? Promise.resolve());
registerRoutePreloader("payroll-run-detail", () => PayrollRunDetailPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("payroll-runs", () => PayrollRunsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("documents-compliance", () => DocumentCompliancePage.preload?.() ?? Promise.resolve());

function RequireAuth() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (bootstrap.setup_required) {
    return <Navigate to="/setup" replace />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function SetupGate() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (!bootstrap.setup_required) {
    return <Navigate to={user ? "/" : "/login"} replace />;
  }
  return <SetupPage />;
}

function LoginGate() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (bootstrap.setup_required) {
    return <Navigate to="/setup" replace />;
  }
  if (user) {
    return <Navigate to={defaultLandingPath(user)} replace />;
  }
  return <LoginPage />;
}

function defaultLandingPath(user: { permissions: string[]; employee_id?: string | null; is_owner?: boolean } | null) {
  if (!user) return "/";
  if (user.is_owner || user.permissions.includes("dashboard.view")) return "/";
  if (user.employee_id && (user.permissions.includes("self_service.view") || user.permissions.some((permission) => permission.startsWith("self_service.")))) return "/self-service";
  return "/";
}

function moduleEnabled(moduleVisibility: Record<string, boolean> | undefined, moduleKey: string | string[], match: "any" | "all" = "any") {
  const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
  const enabled = (key: string) => moduleVisibility?.[key] !== false;
  return match === "all" ? keys.every(enabled) : keys.some(enabled);
}

function OperationalRouteGate({
  moduleKey,
  moduleName,
  children,
  match = "any"
}: {
  moduleKey: string | string[];
  moduleName: string;
  children: ReactElement;
  match?: "any" | "all";
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (moduleEnabled(user?.module_visibility, moduleKey, match)) return children;
  const canOpenSettings = Boolean(user?.is_owner || user?.permissions.some((permission) => ["settings.view", "settings.manage", "admin.modules.view", "admin.settings_hub.view"].includes(permission)));
  return (
    <ModuleDisabledState
      action={
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">{moduleName} module is disabled. Enable this module from Settings to use this feature.</span>
          {canOpenSettings ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/settings")}>
              Open Settings
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

function operational(moduleKey: string | string[], moduleName: string, children: ReactElement) {
  return <OperationalRouteGate moduleKey={moduleKey} moduleName={moduleName}>{children}</OperationalRouteGate>;
}

function operationalAll(moduleKey: string[], moduleName: string, children: ReactElement) {
  return <OperationalRouteGate moduleKey={moduleKey} moduleName={moduleName} match="all">{children}</OperationalRouteGate>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader title={`Loading ${APP_BRANDING.appName} page`} description="Loading the requested workspace module." />}>
      <Routes>
        <Route path="/setup" element={<SetupGate />} />
        <Route path="/login" element={<LoginGate />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="command-center" element={<Navigate to="/dashboard" replace />} />
            <Route path="search" element={<SearchResultsPage />} />
            <Route path="notifications" element={<NotificationCenterPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/kyc-requests" element={<KycRequestsPage />} />
            <Route path="employees/settings" element={<EmployeeSettingsPage />} />
            <Route path="employees/:id" element={<EmployeeProfilePage />} />
            <Route path="onboarding" element={operational("onboarding", "Onboarding", <LifecyclePage mode="onboarding-dashboard" />)} />
            <Route path="onboarding/cases" element={operational("onboarding", "Onboarding", <LifecyclePage mode="onboarding-cases" />)} />
            <Route path="onboarding/alerts" element={operational("onboarding", "Onboarding", <LifecyclePage mode="onboarding-alerts" />)} />
            <Route path="onboarding/settings" element={<LifecyclePage mode="onboarding-settings" />} />
            <Route path="offboarding" element={operational("offboarding", "Offboarding", <LifecyclePage mode="offboarding-dashboard" />)} />
            <Route path="offboarding/cases" element={operational("offboarding", "Offboarding", <LifecyclePage mode="offboarding-cases" />)} />
            <Route path="offboarding/settings" element={<LifecyclePage mode="offboarding-settings" />} />
            <Route path="lifecycle/reports" element={<LifecyclePage mode="lifecycle-reports" />} />
            <Route path="contracts" element={operational("contracts", "Contracts", <ContractsPage />)} />
            <Route path="contracts/probation" element={operational("contracts", "Contracts", <ContractsPage mode="probation" />)} />
            <Route path="contracts/renewals" element={operational("contracts", "Contracts", <ContractsPage mode="renewals" />)} />
            <Route path="contracts/alerts" element={operational("contracts", "Contracts", <ContractsPage mode="alerts" />)} />
            <Route path="approvals" element={operational("approvals", "Approvals", <ApprovalsPage />)} />
            <Route path="approvals/submitted" element={operational("approvals", "Approvals", <ApprovalsPage mode="submitted" />)} />
            <Route path="approvals/overdue" element={operational("approvals", "Approvals", <ApprovalsPage mode="overdue" />)} />
            <Route path="approvals/escalated" element={operational("approvals", "Approvals", <ApprovalsPage mode="escalated" />)} />
            <Route path="approvals/delegated" element={operational("approvals", "Approvals", <ApprovalsPage mode="delegated" />)} />
            <Route path="approvals/history" element={operational("approvals", "Approvals", <ApprovalsPage mode="history" />)} />
            <Route path="approvals/workflows" element={<ApprovalsPage mode="workflows" />} />
            <Route path="approvals/settings" element={<ApprovalsPage mode="settings" />} />
            <Route path="approvals/delegations" element={operational("approvals", "Approvals", <ApprovalsPage mode="delegations" />)} />
            <Route path="approvals/templates" element={<ApprovalsPage mode="templates" />} />
            <Route path="approvals/reports" element={operational("approvals", "Approvals", <ApprovalsPage mode="reports" />)} />
            <Route path="attendance" element={operational("attendance", "Attendance", <AttendanceRecordsPage />)} />
            <Route path="attendance/records" element={operational("attendance", "Attendance", <AttendanceRecordsPage />)} />
            <Route path="attendance/calendar" element={operational("attendance", "Attendance", <AttendanceCalendarPage />)} />
            <Route path="attendance/corrections" element={operational("attendance", "Attendance", <AttendanceCorrectionsPage />)} />
            <Route path="attendance/devices" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDevicesPage />)} />
            <Route path="attendance/devices/settings" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="settings" />)} />
            <Route path="attendance/biometric-mappings" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="mappings" />)} />
            <Route path="attendance/imports" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="imports" />)} />
            <Route path="attendance/raw-logs" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="raw-logs" />)} />
            <Route path="attendance/unmatched-logs" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="unmatched" />)} />
            <Route path="attendance/import-errors" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="errors" />)} />
            <Route path="attendance/locked-day-import-warnings" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="locked-warnings" />)} />
            <Route path="attendance/device-diagnostics" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="diagnostics" />)} />
            <Route path="attendance/vendor-integrations" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="vendor-integrations" />)} />
            <Route path="attendance/device-reports" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDeviceOperationsPage mode="reports" />)} />
            <Route path="attendance/reports" element={operational("attendance", "Attendance", <AttendanceReportsPage />)} />
            <Route path="attendance/settings" element={<AttendanceSettingsPage />} />
            <Route path="leave" element={operational("leave", "Leave", <LeaveRequestsPage />)} />
            <Route path="leave/requests" element={operational("leave", "Leave", <LeaveRequestsPage />)} />
            <Route path="leave/approvals" element={operational("leave", "Leave", <LeaveRequestsPage approvalsOnly />)} />
            <Route path="leave/calendar" element={operational("leave", "Leave", <LeaveCalendarPage />)} />
            <Route path="leave/settings" element={operational("leave", "Leave", <LeaveSettingsPage />)} />
            <Route path="leave/workflows" element={operational("leave", "Leave", <LeaveSettingsPage />)} />
            <Route path="payroll" element={operational("payroll", "Payroll", <PayrollDashboardPage />)} />
            <Route path="payroll/periods" element={operational("payroll", "Payroll", <PayrollPeriodsPage />)} />
            <Route path="payroll/runs" element={operational("payroll", "Payroll", <PayrollRunsPage />)} />
            <Route path="payroll/runs/:id" element={operational("payroll", "Payroll", <PayrollRunDetailPage />)} />
            <Route path="payroll/advances" element={operational("payroll_employee_advances", "Employee advances", <PayrollAdvancesPage />)} />
            <Route path="payroll/deductions" element={operational("payroll", "Payroll", <PayrollDeductionsPage />)} />
            <Route path="payroll/adjustments" element={operational("payroll_adjustments", "Payroll adjustments", <PayrollAdjustmentsPage />)} />
            <Route path="payroll/components" element={operational("payroll", "Payroll", <PayrollComponentsPage />)} />
            <Route path="payroll/payslips" element={operational("payroll_payslips", "Payslips", <PayrollPayslipsPage />)} />
            <Route path="payroll/payment-register" element={operational("payroll_payment_register", "Payment register", <PayrollPaymentRegisterPage />)} />
            <Route path="payroll/payment-institutions" element={operational("payroll_payment_institutions", "Payment institutions", <PayrollPaymentInstitutionsPage />)} />
            <Route path="payroll/bank-loans" element={operational("payroll_bank_loans", "Bank loans", <PayrollBankLoansPage />)} />
            <Route path="payroll/custom-deductions" element={operational("payroll_custom_deductions", "Custom deductions", <PayrollCustomDeductionsPage />)} />
            <Route path="payroll/pension" element={operational("payroll_pension", "Pension", <PayrollPensionPage />)} />
            <Route path="payroll/history" element={operational("payroll", "Payroll", <PayrollHistoryPage />)} />
            <Route path="payroll/exit-payroll" element={operational("final_settlement", "Final settlement", <FinalSettlementPage />)} />
            <Route path="payroll/settings" element={<PayrollSettingsPage />} />
            <Route path="payroll/reports" element={operational("payroll_reports", "Payroll reports", <PayrollReportsPage />)} />
            <Route path="roster" element={operational("roster", "Roster", <RosterWeeklyPage />)} />
            <Route path="roster/weekly" element={operational("roster", "Roster", <RosterWeeklyPage />)} />
            <Route path="roster/shift-templates" element={operational("roster", "Roster", <RosterShiftTemplatesPage />)} />
            <Route path="roster/reports" element={operational("roster", "Roster", <RosterReportsPage />)} />
            <Route path="roster/settings" element={<RosterSettingsPage />} />
            <Route path="documents" element={operational("documents", "Documents", <DocumentRegistryPage />)} />
            <Route path="documents/registry" element={operational("documents", "Documents", <DocumentRegistryPage />)} />
            <Route path="documents/missing" element={operational("documents", "Documents", <MissingDocumentsPage />)} />
            <Route path="documents/compliance" element={operational("documents", "Documents", <DocumentCompliancePage />)} />
            <Route path="documents/compliance/missing" element={operational("documents", "Documents", <DocumentCompliancePage mode="missing" />)} />
            <Route path="documents/compliance/expiring" element={operational("documents", "Documents", <DocumentCompliancePage mode="expiring" />)} />
            <Route path="documents/compliance/expired" element={operational("documents", "Documents", <DocumentCompliancePage mode="expired" />)} />
            <Route path="documents/compliance/alerts" element={operational("documents", "Documents", <DocumentCompliancePage mode="alerts" />)} />
            <Route path="documents/compliance/renewal-cases" element={operational("documents", "Documents", <DocumentCompliancePage mode="renewal-cases" />)} />
            <Route path="documents/compliance/waivers" element={operational("documents", "Documents", <DocumentCompliancePage mode="waivers" />)} />
            <Route path="assets" element={operational("assets_uniforms", "Assets and uniforms", <AssetsDashboardPage />)} />
            <Route path="assets/items" element={operational("assets_uniforms", "Assets and uniforms", <AssetsItemsPage />)} />
            <Route path="assets/assignments" element={operational("assets_uniforms", "Assets and uniforms", <AssetAssignmentsPage />)} />
            <Route path="assets/uniforms" element={operational("assets_uniforms", "Assets and uniforms", <UniformInventoryPage />)} />
            <Route path="assets/uniform-assignments" element={operational("assets_uniforms", "Assets and uniforms", <UniformAssignmentsPage />)} />
            <Route path="assets/uniform-types" element={operational("assets_uniforms", "Assets and uniforms", <UniformTypesPage />)} />
            <Route path="assets/categories" element={operational("assets_uniforms", "Assets and uniforms", <AssetSettingsPage mode="categories" />)} />
            <Route path="assets/deduction-rules" element={operational("assets_uniforms", "Assets and uniforms", <AssetSettingsPage mode="deduction-rules" />)} />
            <Route path="assets/settings" element={<AssetUniformSettingsPage />} />
            <Route path="assets/reports" element={operational("assets_uniforms", "Assets and uniforms", <AssetsReportsPage />)} />
            <Route path="reports" element={operational(["reports", "reports_exports"], "Reports", <ReportsPage />)} />
            <Route path="reports/audit" element={<AuditLogPage />} />
            <Route path="self-service" element={operational("self_service", "Self-service", <SelfServicePage />)} />
            <Route path="self-service/profile" element={operational("self_service", "Self-service", <SelfServicePage mode="profile" />)} />
            <Route path="self-service/documents" element={operationalAll(["self_service", "documents"], "Documents", <SelfServicePage mode="documents" />)} />
            <Route path="self-service/attendance" element={operationalAll(["self_service", "attendance"], "Attendance", <SelfServicePage mode="attendance" />)} />
            <Route path="self-service/leave" element={operationalAll(["self_service", "leave"], "Leave", <SelfServicePage mode="leave" />)} />
            <Route path="self-service/roster" element={operationalAll(["self_service", "roster"], "Roster", <SelfServicePage mode="roster" />)} />
            <Route path="self-service/payroll" element={operationalAll(["self_service", "payroll"], "Payroll", <SelfServicePage mode="payroll" />)} />
            <Route path="self-service/payment-methods" element={operationalAll(["self_service", "payroll", "payroll_payment_methods"], "Payment methods", <SelfServicePage mode="payment-methods" />)} />
            <Route path="self-service/bank-loans" element={operationalAll(["self_service", "payroll", "payroll_bank_loans"], "Bank loans", <SelfServicePage mode="bank-loans" />)} />
            <Route path="self-service/pension" element={operationalAll(["self_service", "payroll", "payroll_pension"], "Pension", <SelfServicePage mode="pension" />)} />
            <Route path="self-service/contracts" element={operationalAll(["self_service", "contracts"], "Contracts", <SelfServicePage mode="contracts" />)} />
            <Route path="self-service/onboarding" element={operationalAll(["self_service", "onboarding"], "Onboarding", <SelfServicePage mode="onboarding" />)} />
            <Route path="self-service/offboarding" element={operationalAll(["self_service", "offboarding"], "Offboarding", <SelfServicePage mode="offboarding" />)} />
            <Route path="self-service/assets" element={operationalAll(["self_service", "assets_uniforms"], "Assets and uniforms", <SelfServicePage mode="assets" />)} />
            <Route path="self-service/uniforms" element={operationalAll(["self_service", "assets_uniforms"], "Assets and uniforms", <SelfServicePage mode="uniforms" />)} />
            <Route path="self-service/approvals" element={operationalAll(["self_service", "approvals"], "Approvals", <SelfServicePage mode="approvals" />)} />
            <Route path="self-service/notifications" element={operationalAll(["self_service", "notifications"], "Notifications", <SelfServicePage mode="notifications" />)} />
            <Route path="self-service/kyc-requests" element={operationalAll(["self_service", "documents"], "KYC requests", <SelfServicePage mode="kyc" />)} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/admin" element={<AdminSettingsPage />} />
            <Route path="admin/help" element={<AdminHelpGuidePage />} />
            <Route path="settings/admin/imports" element={<DataTransferPage mode="imports" />} />
            <Route path="settings/admin/import-templates" element={<DataTransferPage mode="templates" />} />
            <Route path="settings/admin/exports" element={<DataTransferPage mode="exports" />} />
            <Route path="settings/admin/backup-readiness" element={<DataTransferPage mode="backup" />} />
            <Route path="settings/admin/migration-readiness" element={<DataTransferPage mode="migration" />} />
            <Route path="settings/admin/remote-d1-apply-guide" element={<DataTransferPage mode="remote-d1" />} />
            <Route path="settings/admin/qa-test-matrix" element={<DataTransferPage mode="qa" />} />
            <Route path="settings/admin/smoke-tests" element={<DataTransferPage mode="smoke" />} />
            <Route path="settings/admin/deployment-readiness" element={<DataTransferPage mode="deployment" />} />
            <Route path="settings/admin/data-transfer-settings" element={<DataTransferPage mode="settings" />} />
            <Route path="settings/organization" element={<OrganizationSettingsPage />} />
            <Route path="settings/self-service" element={<SelfServiceSettingsPage />} />
            <Route path="settings/documents" element={<DocumentSettingsPage />} />
            <Route path="settings/documents/compliance" element={<DocumentCompliancePage mode="settings" />} />
            <Route path="settings/documents/compliance/types" element={<DocumentCompliancePage mode="type-settings" />} />
            <Route path="settings/contracts" element={<ContractsPage mode="settings" />} />
            <Route path="settings/employee-notes" element={<EmployeeNotesSettingsPage />} />
            <Route path="settings/import-migration" element={<ImportMigrationPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="users-access" element={<UsersAccessPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
