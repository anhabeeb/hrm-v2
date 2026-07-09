import { lazy, Suspense, type ComponentType, type ReactElement } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
const AdminBackupRetentionPage = lazyPage(() => import("../pages/AdminBackupRetentionPage"), "AdminBackupRetentionPage");
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
// Temporary preview-only routes for the pages-v3 redesign rebuild (see project memory) — not linked from any nav, removed once each page is promoted to replace its pages/ counterpart.
const DashboardPageV3 = lazyPage(() => import("../pages-v3/DashboardPage"), "DashboardPage");
const EmployeesPageV3 = lazyPage(() => import("../pages-v3/EmployeesPage"), "EmployeesPage");
const EmployeeProfilePageV3 = lazyPage(() => import("../pages-v3/EmployeeProfilePage"), "EmployeeProfilePage");
const AttendanceListPageV3 = lazyPage(() => import("../pages-v3/AttendanceListPage"), "AttendanceListPage");
const AttendanceEmployeeCalendarPageV3 = lazyPage(() => import("../pages-v3/AttendanceEmployeeCalendarPage"), "AttendanceEmployeeCalendarPage");
const PayrollRunsListPageV3 = lazyPage(() => import("../pages-v3/PayrollRunsListPage"), "PayrollRunsListPage");
const PayrollRunDetailPageV3 = lazyPage(() => import("../pages-v3/PayrollRunDetailPage"), "PayrollRunDetailPage");
const PayrollPeriodsPageV3 = lazyPage(() => import("../pages-v3/PayrollPeriodsPage"), "PayrollPeriodsPage");
const PayrollPayslipsPageV3 = lazyPage(() => import("../pages-v3/PayrollPayslipsPage"), "PayrollPayslipsPage");
const PayrollPaymentRegisterPageV3 = lazyPage(() => import("../pages-v3/PayrollPaymentRegisterPage"), "PayrollPaymentRegisterPage");
const PayrollAdvancesPageV3 = lazyPage(() => import("../pages-v3/PayrollAdvancesPage"), "PayrollAdvancesPage");
const PayrollDeductionsPageV3 = lazyPage(() => import("../pages-v3/PayrollDeductionsPage"), "PayrollDeductionsPage");
const PayrollAdjustmentsPageV3 = lazyPage(() => import("../pages-v3/PayrollAdjustmentsPage"), "PayrollAdjustmentsPage");
const PayrollInstitutionsPageV3 = lazyPage(() => import("../pages-v3/PayrollInstitutionsPage"), "PayrollInstitutionsPage");
const PayrollBankLoansPageV3 = lazyPage(() => import("../pages-v3/PayrollBankLoansPage"), "PayrollBankLoansPage");
const PayrollPensionPageV3 = lazyPage(() => import("../pages-v3/PayrollPensionPage"), "PayrollPensionPage");
const PayrollFinalSettlementPageV3 = lazyPage(() => import("../pages-v3/PayrollFinalSettlementPage"), "PayrollFinalSettlementPage");
const PayrollReportsPageV3 = lazyPage(() => import("../pages-v3/PayrollReportsPage"), "PayrollReportsPage");
const PayrollDashboardPageV3 = lazyPage(() => import("../pages-v3/PayrollDashboardPage"), "PayrollDashboardPage");
const PayrollComponentsPageV3 = lazyPage(() => import("../pages-v3/PayrollComponentsPage"), "PayrollComponentsPage");
const PayrollCustomDeductionsPageV3 = lazyPage(() => import("../pages-v3/PayrollCustomDeductionsPage"), "PayrollCustomDeductionsPage");
const PayrollHistoryPageV3 = lazyPage(() => import("../pages-v3/PayrollHistoryPage"), "PayrollHistoryPage");
const PayrollSettingsPageV3 = lazyPage(() => import("../pages-v3/PayrollSettingsPage"), "PayrollSettingsPage");
const LeaveRequestsPageV3 = lazyPage(() => import("../pages-v3/LeaveRequestsPage"), "LeaveRequestsPage");
const LeaveCalendarPageV3 = lazyPage(() => import("../pages-v3/LeaveCalendarPage"), "LeaveCalendarPage");
const LeaveBalancesPageV3 = lazyPage(() => import("../pages-v3/LeaveBalancesPage"), "LeaveBalancesPage");
const LeaveTypesPoliciesPageV3 = lazyPage(() => import("../pages-v3/LeaveTypesPoliciesPage"), "LeaveTypesPoliciesPage");
const LeaveWorkflowsPageV3 = lazyPage(() => import("../pages-v3/LeaveWorkflowsPage"), "LeaveWorkflowsPage");
const LeaveDocumentRulesPageV3 = lazyPage(() => import("../pages-v3/LeaveDocumentRulesPage"), "LeaveDocumentRulesPage");
const LeaveDeductionRulesPageV3 = lazyPage(() => import("../pages-v3/LeaveDeductionRulesPage"), "LeaveDeductionRulesPage");
const AssetsItemsPageV3 = lazyPage(() => import("../pages-v3/AssetsItemsPage"), "AssetsItemsPage");
const AssetAssignmentsPageV3 = lazyPage(() => import("../pages-v3/AssetAssignmentsPage"), "AssetAssignmentsPage");
const AssetsReportsPageV3 = lazyPage(() => import("../pages-v3/AssetsReportsPage"), "AssetsReportsPage");
const AssetsDashboardPageV3 = lazyPage(() => import("../pages-v3/AssetsDashboardPage"), "AssetsDashboardPage");
const AssetUniformTypesPageV3 = lazyPage(() => import("../pages-v3/AssetUniformTypesPage"), "AssetUniformTypesPage");
const AssetUniformInventoryPageV3 = lazyPage(() => import("../pages-v3/AssetUniformInventoryPage"), "AssetUniformInventoryPage");
const AssetUniformAssignmentsPageV3 = lazyPage(() => import("../pages-v3/AssetUniformAssignmentsPage"), "AssetUniformAssignmentsPage");
const AssetCategoriesPageV3 = lazyPage(() => import("../pages-v3/AssetCategoriesPage"), "AssetCategoriesPage");
const AssetDeductionRulesPageV3 = lazyPage(() => import("../pages-v3/AssetDeductionRulesPage"), "AssetDeductionRulesPage");
const AssetUniformSettingsPageV3 = lazyPage(() => import("../pages-v3/AssetUniformSettingsPage"), "AssetUniformSettingsPage");
const DocumentsRegistryPageV3 = lazyPage(() => import("../pages-v3/DocumentsRegistryPage"), "DocumentsRegistryPage");
const DocumentsCompliancePageV3 = lazyPage(() => import("../pages-v3/DocumentsCompliancePage"), "DocumentsCompliancePage");
const DocumentsMissingPageV3 = lazyPage(() => import("../pages-v3/DocumentsMissingPage"), "DocumentsMissingPage");
const OnboardingListPageV3 = lazyPage(() => import("../pages-v3/OnboardingListPage"), "OnboardingListPage");
const OnboardingCaseWorkspacePageV3 = lazyPage(() => import("../pages-v3/OnboardingCaseWorkspacePage"), "OnboardingCaseWorkspacePage");
const OffboardingListPageV3 = lazyPage(() => import("../pages-v3/OffboardingListPage"), "OffboardingListPage");
const OffboardingCaseWorkspacePageV3 = lazyPage(() => import("../pages-v3/OffboardingCaseWorkspacePage"), "OffboardingCaseWorkspacePage");
const LifecycleSettingsPageV3 = lazyPage(() => import("../pages-v3/LifecycleSettingsPage"), "LifecycleSettingsPage");
const OnboardingAlertsPageV3 = lazyPage(() => import("../pages-v3/OnboardingAlertsPage"), "OnboardingAlertsPage");
const RosterWeeklyPageV3 = lazyPage(() => import("../pages-v3/RosterWeeklyPage"), "RosterWeeklyPage");
const RosterShiftTemplatesPageV3 = lazyPage(() => import("../pages-v3/RosterShiftTemplatesPage"), "RosterShiftTemplatesPage");
const RosterReportsPageV3 = lazyPage(() => import("../pages-v3/RosterReportsPage"), "RosterReportsPage");
const RosterSettingsPageV3 = lazyPage(() => import("../pages-v3/RosterSettingsPage"), "RosterSettingsPage");
const SettingsHubPageV3 = lazyPage(() => import("../pages-v3/SettingsHubPage"), "SettingsHubPage");
const SettingsModulesPageV3 = lazyPage(() => import("../pages-v3/SettingsModulesPage"), "SettingsModulesPage");
const OrganizationSettingsPageV3 = lazyPage(() => import("../pages-v3/OrganizationSettingsPage"), "OrganizationSettingsPage");
const AdminSettingsPageV3 = lazyPage(() => import("../pages-v3/AdminSettingsPage"), "AdminSettingsPage");
const SelfServiceSettingsPageV3 = lazyPage(() => import("../pages-v3/SelfServiceSettingsPage"), "SelfServiceSettingsPage");
const DocumentSettingsPageV3 = lazyPage(() => import("../pages-v3/DocumentSettingsPage"), "DocumentSettingsPage");
const DocumentComplianceSettingsPageV3 = lazyPage(() => import("../pages-v3/DocumentComplianceSettingsPage"), "DocumentComplianceSettingsPage");
const ContractsSettingsPageV3 = lazyPage(() => import("../pages-v3/ContractsSettingsPage"), "ContractsSettingsPage");
const EmployeeNotesSettingsPageV3 = lazyPage(() => import("../pages-v3/EmployeeNotesSettingsPage"), "EmployeeNotesSettingsPage");
const SelfServiceHomePageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceHomePage"), "SelfServiceHomePage");
const SelfServiceProfilePageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceProfilePage"), "SelfServiceProfilePage");
const SelfServiceDocumentsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceDocumentsPage"), "SelfServiceDocumentsPage");
const SelfServiceAttendancePageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceAttendancePage"), "SelfServiceAttendancePage");
const SelfServiceLeavePageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceLeavePage"), "SelfServiceLeavePage");
const SelfServiceRosterPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceRosterPage"), "SelfServiceRosterPage");
const SelfServicePayrollPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServicePayrollPage"), "SelfServicePayrollPage");
const SelfServiceContractsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceContractsPage"), "SelfServiceContractsPage");
const SelfServiceAssetsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceAssetsPage"), "SelfServiceAssetsPage");
const SelfServicePaymentMethodsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServicePaymentMethodsPage"), "SelfServicePaymentMethodsPage");
const SelfServiceBankLoansPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceBankLoansPage"), "SelfServiceBankLoansPage");
const SelfServicePensionPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServicePensionPage"), "SelfServicePensionPage");
const SelfServiceOnboardingPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceOnboardingPage"), "SelfServiceOnboardingPage");
const SelfServiceOffboardingPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceOffboardingPage"), "SelfServiceOffboardingPage");
const SelfServiceUniformsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceUniformsPage"), "SelfServiceUniformsPage");
const SelfServiceApprovalsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceApprovalsPage"), "SelfServiceApprovalsPage");
const SelfServiceNotificationsPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceNotificationsPage"), "SelfServiceNotificationsPage");
const SelfServiceKycPageV3 = lazyPage(() => import("../pages-v3/self-service/SelfServiceKycPage"), "SelfServiceKycPage");
const ContractsListPageV3 = lazyPage(() => import("../pages-v3/ContractsListPage"), "ContractsListPage");
const ContractsTypesPageV3 = lazyPage(() => import("../pages-v3/ContractsTypesPage"), "ContractsTypesPage");
const ContractsProbationPageV3 = lazyPage(() => import("../pages-v3/ContractsProbationPage"), "ContractsProbationPage");
const ContractsRenewalsPageV3 = lazyPage(() => import("../pages-v3/ContractsRenewalsPage"), "ContractsRenewalsPage");
const ContractsAlertsPageV3 = lazyPage(() => import("../pages-v3/ContractsAlertsPage"), "ContractsAlertsPage");
const ApprovalInboxPageV3 = lazyPage(() => import("../pages-v3/ApprovalInboxPage"), "ApprovalInboxPage");
const ApprovalWorkflowsPageV3 = lazyPage(() => import("../pages-v3/ApprovalWorkflowsPage"), "ApprovalWorkflowsPage");
const ApprovalDelegationsPageV3 = lazyPage(() => import("../pages-v3/ApprovalDelegationsPage"), "ApprovalDelegationsPage");
const ApprovalTemplatesPageV3 = lazyPage(() => import("../pages-v3/ApprovalTemplatesPage"), "ApprovalTemplatesPage");
const ApprovalReportsPageV3 = lazyPage(() => import("../pages-v3/ApprovalReportsPage"), "ApprovalReportsPage");
const ApprovalSettingsPageV3 = lazyPage(() => import("../pages-v3/ApprovalSettingsPage"), "ApprovalSettingsPage");
const KycRequestsPageV3 = lazyPage(() => import("../pages-v3/KycRequestsPage"), "KycRequestsPage");
const EmployeeSetupListPageV3 = lazyPage(() => import("../pages-v3/EmployeeSetupListPage"), "EmployeeSetupListPage");
const EmployeeSettingsPageV3 = lazyPage(() => import("../pages-v3/EmployeeSettingsPage"), "EmployeeSettingsPage");
const ReportsPageV3 = lazyPage(() => import("../pages-v3/ReportsPage"), "ReportsPage");
const AuditLogPageV3 = lazyPage(() => import("../pages-v3/AuditLogPage"), "AuditLogPage");
const UsersAccessUsersPageV3 = lazyPage(() => import("../pages-v3/UsersAccessUsersPage"), "UsersAccessUsersPage");
const UsersAccessRolesPageV3 = lazyPage(() => import("../pages-v3/UsersAccessRolesPage"), "UsersAccessRolesPage");
const UsersAccessPermissionsPageV3 = lazyPage(() => import("../pages-v3/UsersAccessPermissionsPage"), "UsersAccessPermissionsPage");
const UsersAccessRoleMappingsPageV3 = lazyPage(() => import("../pages-v3/UsersAccessRoleMappingsPage"), "UsersAccessRoleMappingsPage");
const UsersAccessScopesPageV3 = lazyPage(() => import("../pages-v3/UsersAccessScopesPage"), "UsersAccessScopesPage");
const AttendanceCalendarPageV3 = lazyPage(() => import("../pages-v3/AttendanceCalendarPage"), "AttendanceCalendarPage");
const AttendanceCorrectionsPageV3 = lazyPage(() => import("../pages-v3/AttendanceCorrectionsPage"), "AttendanceCorrectionsPage");
const AttendanceDevicesPageV3 = lazyPage(() => import("../pages-v3/AttendanceDevicesPage"), "AttendanceDevicesPage");
const AttendanceReportsPageV3 = lazyPage(() => import("../pages-v3/AttendanceReportsPage"), "AttendanceReportsPage");
const AttendanceSettingsPageV3 = lazyPage(() => import("../pages-v3/AttendanceSettingsPage"), "AttendanceSettingsPage");
const DataTransferPage = lazyPage(() => import("../pages/DataTransferPage"), "DataTransferPage");
const DocumentCompliancePage = lazyPage(() => import("../pages/DocumentCompliancePage"), "DocumentCompliancePage");
const DocumentRegistryPage = lazyPage(() => import("../pages/DocumentRegistryPage"), "DocumentRegistryPage");
const DocumentSettingsPage = lazyPage(() => import("../pages/DocumentSettingsPage"), "DocumentSettingsPage");
const EmployeeNotesSettingsPage = lazyPage(() => import("../pages/EmployeeNotesSettingsPage"), "EmployeeNotesSettingsPage");
const EmployeeProfilePage = lazyPage(() => import("../pages/EmployeeProfilePage"), "EmployeeProfilePage");
const EmployeeSetupListPage = lazyPage(() => import("../pages/EmployeeSetupListPage"), "EmployeeSetupListPage");
const EmployeeSettingsPage = lazyPage(() => import("../pages/EmployeeSettingsPage"), "EmployeeSettingsPage");
const EmployeesPage = lazyPage(() => import("../pages/EmployeesPage"), "EmployeesPage");
const FinalSettlementPage = lazyPage(() => import("../pages/FinalSettlementPage"), "FinalSettlementPage");
const ImportMigrationPage = lazyPage(() => import("../pages/ImportMigrationPage"), "ImportMigrationPage");
const KycRequestsPage = lazyPage(() => import("../pages/KycRequestsPage"), "KycRequestsPage");
const LeaveCalendarPage = lazyPage(() => import("../pages/LeaveCalendarPage"), "LeaveCalendarPage");
const LeaveRequestsPage = lazyPage(() => import("../pages/LeaveRequestsPage"), "LeaveRequestsPage");
const LeaveSettingsPage = lazyPage(() => import("../pages/LeaveSettingsPage"), "LeaveSettingsPage");
const OnboardingCasesPage = lazyPage(() => import("../pages/lifecycle/OnboardingCasesPage"), "OnboardingCasesPage");
const OnboardingAlertsPage = lazyPage(() => import("../pages/lifecycle/OnboardingAlertsPage"), "OnboardingAlertsPage");
const OnboardingSettingsPage = lazyPage(() => import("../pages/lifecycle/OnboardingSettingsPage"), "OnboardingSettingsPage");
const OffboardingDashboardPage = lazyPage(() => import("../pages/lifecycle/OffboardingDashboardPage"), "OffboardingDashboardPage");
const OffboardingCasesPage = lazyPage(() => import("../pages/lifecycle/OffboardingCasesPage"), "OffboardingCasesPage");
const OffboardingSettingsPage = lazyPage(() => import("../pages/lifecycle/OffboardingSettingsPage"), "OffboardingSettingsPage");
const LifecycleReportsPage = lazyPage(() => import("../pages/lifecycle/LifecycleReportsPage"), "LifecycleReportsPage");
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
const PerformanceDashboardPage = lazyPage(() => import("../pages/PerformanceDashboardPage"), "PerformanceDashboardPage");
const PlaceholderModulePage = lazyPage(() => import("../pages/PlaceholderModulePage"), "PlaceholderModulePage");
const ReportsPage = lazyPage(() => import("../pages/ReportsPage"), "ReportsPage");
const RosterReportsPage = lazyPage(() => import("../pages/RosterReportsPage"), "RosterReportsPage");
const RosterSettingsPage = lazyPage(() => import("../pages/RosterSettingsPage"), "RosterSettingsPage");
const RosterShiftTemplatesPage = lazyPage(() => import("../pages/RosterShiftTemplatesPage"), "RosterShiftTemplatesPage");
const RosterWeeklyPage = lazyPage(() => import("../pages/RosterWeeklyPage"), "RosterWeeklyPage");
const SelfServiceHomePage = lazyPage(() => import("../pages/self-service/SelfServiceHomePage"), "SelfServiceHomePage");
const SelfServiceProfilePage = lazyPage(() => import("../pages/self-service/SelfServiceProfilePage"), "SelfServiceProfilePage");
const SelfServiceDocumentsPage = lazyPage(() => import("../pages/self-service/SelfServiceDocumentsPage"), "SelfServiceDocumentsPage");
const SelfServiceAttendancePage = lazyPage(() => import("../pages/self-service/SelfServiceAttendancePage"), "SelfServiceAttendancePage");
const SelfServiceLeavePage = lazyPage(() => import("../pages/self-service/SelfServiceLeavePage"), "SelfServiceLeavePage");
const SelfServiceRosterPage = lazyPage(() => import("../pages/self-service/SelfServiceRosterPage"), "SelfServiceRosterPage");
const SelfServicePayrollPage = lazyPage(() => import("../pages/self-service/SelfServicePayrollPage"), "SelfServicePayrollPage");
const SelfServicePaymentMethodsPage = lazyPage(() => import("../pages/self-service/SelfServicePaymentMethodsPage"), "SelfServicePaymentMethodsPage");
const SelfServiceBankLoansPage = lazyPage(() => import("../pages/self-service/SelfServiceBankLoansPage"), "SelfServiceBankLoansPage");
const SelfServicePensionPage = lazyPage(() => import("../pages/self-service/SelfServicePensionPage"), "SelfServicePensionPage");
const SelfServiceContractsPage = lazyPage(() => import("../pages/self-service/SelfServiceContractsPage"), "SelfServiceContractsPage");
const SelfServiceOnboardingPage = lazyPage(() => import("../pages/self-service/SelfServiceOnboardingPage"), "SelfServiceOnboardingPage");
const SelfServiceOffboardingPage = lazyPage(() => import("../pages/self-service/SelfServiceOffboardingPage"), "SelfServiceOffboardingPage");
const SelfServiceAssetsPage = lazyPage(() => import("../pages/self-service/SelfServiceAssetsPage"), "SelfServiceAssetsPage");
const SelfServiceUniformsPage = lazyPage(() => import("../pages/self-service/SelfServiceUniformsPage"), "SelfServiceUniformsPage");
const SelfServiceApprovalsPage = lazyPage(() => import("../pages/self-service/SelfServiceApprovalsPage"), "SelfServiceApprovalsPage");
const SelfServiceNotificationsPage = lazyPage(() => import("../pages/self-service/SelfServiceNotificationsPage"), "SelfServiceNotificationsPage");
const SelfServiceKycPage = lazyPage(() => import("../pages/self-service/SelfServiceKycPage"), "SelfServiceKycPage");
const SelfServiceSettingsPage = lazyPage(() => import("../pages/SelfServiceSettingsPage"), "SelfServiceSettingsPage");
const SearchResultsPage = lazyPage(() => import("../pages/SearchResultsPage"), "SearchResultsPage");
const SettingsPage = lazyPage(() => import("../pages/SettingsPage"), "SettingsPage");
const SetupPage = lazyPage(() => import("../pages/SetupPage"), "SetupPage");
const UsersAccessPage = lazyPage(() => import("../pages/UsersAccessPage"), "UsersAccessPage");

registerRoutePreloader("employee-profile", () => EmployeeProfilePage.preload?.() ?? Promise.resolve());
registerRoutePreloader("employee-setup", () => EmployeeSetupListPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("employees", () => EmployeesPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("dashboard", () => DashboardPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("onboarding-case", () => OnboardingCasesPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("contracts", () => ContractsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("approvals", () => ApprovalsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("attendance", () => AttendanceRecordsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("roster", () => RosterWeeklyPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("leave", () => LeaveRequestsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("payroll", () => PayrollDashboardPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("payroll-run-detail", () => PayrollRunDetailPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("payroll-runs", () => PayrollRunsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("reports", () => ReportsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("data-transfer", () => DataTransferPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("documents", () => DocumentRegistryPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("documents-compliance", () => DocumentCompliancePage.preload?.() ?? Promise.resolve());
registerRoutePreloader("assets", () => AssetsDashboardPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("settings", () => SettingsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("admin-settings", () => AdminSettingsPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("admin-backup-retention", () => AdminBackupRetentionPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("performance-dashboard", () => PerformanceDashboardPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("admin-help", () => AdminHelpGuidePage.preload?.() ?? Promise.resolve());
registerRoutePreloader("users-access", () => UsersAccessPage.preload?.() ?? Promise.resolve());
registerRoutePreloader("self-service", () => SelfServiceHomePage.preload?.() ?? Promise.resolve());

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

function LegacyOnboardingRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const caseId = params.get("case_id") ?? params.get("legacy_case");
  return <Navigate to={caseId ? `/employees/setup?legacy_case=${encodeURIComponent(caseId)}` : "/employees/setup"} replace />;
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
            <Route index element={<DashboardPageV3 />} />
            <Route path="dashboard" element={<DashboardPageV3 />} />
            <Route path="command-center" element={<Navigate to="/dashboard" replace />} />
            <Route path="v3-preview/dashboard" element={<DashboardPageV3 />} />
            <Route path="v3-preview/employees" element={<EmployeesPageV3 />} />
            <Route path="v3-preview/employees/:id" element={<EmployeeProfilePageV3 />} />
            <Route path="v3-preview/attendance" element={<AttendanceListPageV3 />} />
            <Route path="v3-preview/attendance/:employeeId" element={<AttendanceEmployeeCalendarPageV3 />} />
            <Route path="v3-preview/payroll" element={<PayrollDashboardPageV3 />} />
            <Route path="v3-preview/payroll/runs" element={<PayrollRunsListPageV3 />} />
            <Route path="v3-preview/payroll/runs/:runId" element={<PayrollRunDetailPageV3 />} />
            <Route path="v3-preview/payroll/periods" element={<PayrollPeriodsPageV3 />} />
            <Route path="v3-preview/payroll/payslips" element={<PayrollPayslipsPageV3 />} />
            <Route path="v3-preview/payroll/payment-register" element={<PayrollPaymentRegisterPageV3 />} />
            <Route path="v3-preview/payroll/advances" element={<PayrollAdvancesPageV3 />} />
            <Route path="v3-preview/payroll/deductions" element={<PayrollDeductionsPageV3 />} />
            <Route path="v3-preview/payroll/adjustments" element={<PayrollAdjustmentsPageV3 />} />
            <Route path="v3-preview/payroll/components" element={<PayrollComponentsPageV3 />} />
            <Route path="v3-preview/payroll/institutions" element={<PayrollInstitutionsPageV3 />} />
            <Route path="v3-preview/payroll/bank-loans" element={<PayrollBankLoansPageV3 />} />
            <Route path="v3-preview/payroll/custom-deductions" element={<PayrollCustomDeductionsPageV3 />} />
            <Route path="v3-preview/payroll/pension" element={<PayrollPensionPageV3 />} />
            <Route path="v3-preview/payroll/final-settlement" element={<PayrollFinalSettlementPageV3 />} />
            <Route path="v3-preview/payroll/history" element={<PayrollHistoryPageV3 />} />
            <Route path="v3-preview/payroll/settings" element={<PayrollSettingsPageV3 />} />
            <Route path="v3-preview/payroll/reports" element={<PayrollReportsPageV3 />} />
            <Route path="v3-preview/leave/requests" element={<LeaveRequestsPageV3 />} />
            <Route path="v3-preview/leave/approvals" element={<LeaveRequestsPageV3 approvalsOnly />} />
            <Route path="v3-preview/leave/calendar" element={<LeaveCalendarPageV3 />} />
            <Route path="v3-preview/leave/balances" element={<LeaveBalancesPageV3 />} />
            <Route path="v3-preview/leave/types-policies" element={<LeaveTypesPoliciesPageV3 />} />
            <Route path="v3-preview/leave/workflows" element={<LeaveWorkflowsPageV3 />} />
            <Route path="v3-preview/leave/document-rules" element={<LeaveDocumentRulesPageV3 />} />
            <Route path="v3-preview/leave/deduction-rules" element={<LeaveDeductionRulesPageV3 />} />
            <Route path="v3-preview/assets" element={<AssetsDashboardPageV3 />} />
            <Route path="v3-preview/assets/items" element={<AssetsItemsPageV3 />} />
            <Route path="v3-preview/assets/assignments" element={<AssetAssignmentsPageV3 />} />
            <Route path="v3-preview/assets/uniform-types" element={<AssetUniformTypesPageV3 />} />
            <Route path="v3-preview/assets/uniforms" element={<AssetUniformInventoryPageV3 />} />
            <Route path="v3-preview/assets/uniform-assignments" element={<AssetUniformAssignmentsPageV3 />} />
            <Route path="v3-preview/assets/categories" element={<AssetCategoriesPageV3 />} />
            <Route path="v3-preview/assets/deduction-rules" element={<AssetDeductionRulesPageV3 />} />
            <Route path="v3-preview/assets/settings" element={<AssetUniformSettingsPageV3 />} />
            <Route path="v3-preview/assets/reports" element={<AssetsReportsPageV3 />} />
            <Route path="v3-preview/documents/registry" element={<DocumentsRegistryPageV3 />} />
            <Route path="v3-preview/documents/compliance" element={<DocumentsCompliancePageV3 />} />
            <Route path="v3-preview/documents/compliance/missing" element={<DocumentsCompliancePageV3 mode="missing" />} />
            <Route path="v3-preview/documents/compliance/expiring" element={<DocumentsCompliancePageV3 mode="expiring" />} />
            <Route path="v3-preview/documents/compliance/expired" element={<DocumentsCompliancePageV3 mode="expired" />} />
            <Route path="v3-preview/documents/compliance/alerts" element={<DocumentsCompliancePageV3 mode="alerts" />} />
            <Route path="v3-preview/documents/compliance/renewal-cases" element={<DocumentsCompliancePageV3 mode="renewal-cases" />} />
            <Route path="v3-preview/documents/compliance/waivers" element={<DocumentsCompliancePageV3 mode="waivers" />} />
            <Route path="v3-preview/documents/missing" element={<DocumentsMissingPageV3 />} />
            <Route path="v3-preview/onboarding" element={<OnboardingListPageV3 />} />
            <Route path="v3-preview/onboarding/alerts" element={<OnboardingAlertsPageV3 />} />
            <Route path="v3-preview/onboarding/settings" element={<LifecycleSettingsPageV3 kind="onboarding" />} />
            <Route path="v3-preview/onboarding/:caseId" element={<OnboardingCaseWorkspacePageV3 />} />
            <Route path="v3-preview/offboarding" element={<OffboardingListPageV3 />} />
            <Route path="v3-preview/offboarding/settings" element={<LifecycleSettingsPageV3 kind="offboarding" />} />
            <Route path="v3-preview/offboarding/:caseId" element={<OffboardingCaseWorkspacePageV3 />} />
            <Route path="v3-preview/roster" element={<RosterWeeklyPageV3 />} />
            <Route path="v3-preview/roster/shift-templates" element={<RosterShiftTemplatesPageV3 />} />
            <Route path="v3-preview/roster/reports" element={<RosterReportsPageV3 />} />
            <Route path="v3-preview/roster/settings" element={<RosterSettingsPageV3 />} />
            <Route path="v3-preview/settings" element={<SettingsHubPageV3 />} />
            <Route path="v3-preview/settings/modules" element={<SettingsModulesPageV3 />} />
            <Route path="v3-preview/settings/organization" element={<OrganizationSettingsPageV3 />} />
            <Route path="v3-preview/settings/admin" element={<AdminSettingsPageV3 />} />
            <Route path="v3-preview/settings/self-service" element={<SelfServiceSettingsPageV3 />} />
            <Route path="v3-preview/settings/documents" element={<DocumentSettingsPageV3 />} />
            <Route path="v3-preview/settings/documents/compliance" element={<DocumentComplianceSettingsPageV3 />} />
            <Route path="v3-preview/settings/documents/compliance/types" element={<DocumentComplianceSettingsPageV3 initialTab="type-rules" />} />
            <Route path="v3-preview/settings/contracts" element={<ContractsSettingsPageV3 />} />
            <Route path="v3-preview/settings/employee-notes" element={<EmployeeNotesSettingsPageV3 />} />
            <Route path="v3-preview/self-service" element={<SelfServiceHomePageV3 />} />
            <Route path="v3-preview/self-service/profile" element={<SelfServiceProfilePageV3 />} />
            <Route path="v3-preview/self-service/documents" element={<SelfServiceDocumentsPageV3 />} />
            <Route path="v3-preview/self-service/attendance" element={<SelfServiceAttendancePageV3 />} />
            <Route path="v3-preview/self-service/leave" element={<SelfServiceLeavePageV3 />} />
            <Route path="v3-preview/self-service/roster" element={<SelfServiceRosterPageV3 />} />
            <Route path="v3-preview/self-service/payroll" element={<SelfServicePayrollPageV3 />} />
            <Route path="v3-preview/self-service/contracts" element={<SelfServiceContractsPageV3 />} />
            <Route path="v3-preview/self-service/assets" element={<SelfServiceAssetsPageV3 />} />
            <Route path="v3-preview/self-service/payment-methods" element={<SelfServicePaymentMethodsPageV3 />} />
            <Route path="v3-preview/self-service/bank-loans" element={<SelfServiceBankLoansPageV3 />} />
            <Route path="v3-preview/self-service/pension" element={<SelfServicePensionPageV3 />} />
            <Route path="v3-preview/self-service/onboarding" element={<SelfServiceOnboardingPageV3 />} />
            <Route path="v3-preview/self-service/offboarding" element={<SelfServiceOffboardingPageV3 />} />
            <Route path="v3-preview/self-service/uniforms" element={<SelfServiceUniformsPageV3 />} />
            <Route path="v3-preview/self-service/approvals" element={<SelfServiceApprovalsPageV3 />} />
            <Route path="v3-preview/self-service/notifications" element={<SelfServiceNotificationsPageV3 />} />
            <Route path="v3-preview/self-service/kyc-requests" element={<SelfServiceKycPageV3 />} />
            <Route path="v3-preview/contracts" element={<ContractsListPageV3 />} />
            <Route path="v3-preview/contracts/types" element={<ContractsTypesPageV3 />} />
            <Route path="v3-preview/contracts/probation" element={<ContractsProbationPageV3 />} />
            <Route path="v3-preview/contracts/renewals" element={<ContractsRenewalsPageV3 />} />
            <Route path="v3-preview/contracts/alerts" element={<ContractsAlertsPageV3 />} />
            <Route path="v3-preview/approvals" element={<ApprovalInboxPageV3 mode="inbox" />} />
            <Route path="v3-preview/approvals/submitted" element={<ApprovalInboxPageV3 mode="submitted" />} />
            <Route path="v3-preview/approvals/overdue" element={<ApprovalInboxPageV3 mode="overdue" />} />
            <Route path="v3-preview/approvals/escalated" element={<ApprovalInboxPageV3 mode="escalated" />} />
            <Route path="v3-preview/approvals/delegated" element={<ApprovalInboxPageV3 mode="delegated" />} />
            <Route path="v3-preview/approvals/history" element={<ApprovalInboxPageV3 mode="history" />} />
            <Route path="v3-preview/approvals/workflows" element={<ApprovalWorkflowsPageV3 />} />
            <Route path="v3-preview/approvals/delegations" element={<ApprovalDelegationsPageV3 />} />
            <Route path="v3-preview/approvals/templates" element={<ApprovalTemplatesPageV3 />} />
            <Route path="v3-preview/approvals/reports" element={<ApprovalReportsPageV3 />} />
            <Route path="v3-preview/approvals/settings" element={<ApprovalSettingsPageV3 />} />
            <Route path="v3-preview/employees/kyc-requests" element={<KycRequestsPageV3 />} />
            <Route path="v3-preview/employees/setup" element={<EmployeeSetupListPageV3 />} />
            <Route path="v3-preview/employees/settings" element={<EmployeeSettingsPageV3 />} />
            <Route path="v3-preview/reports" element={<ReportsPageV3 />} />
            <Route path="v3-preview/audit" element={<AuditLogPageV3 />} />
            <Route path="v3-preview/users-access/users" element={<UsersAccessUsersPageV3 />} />
            <Route path="v3-preview/users-access/roles" element={<UsersAccessRolesPageV3 />} />
            <Route path="v3-preview/users-access/permissions" element={<UsersAccessPermissionsPageV3 />} />
            <Route path="v3-preview/users-access/role-mappings" element={<UsersAccessRoleMappingsPageV3 />} />
            <Route path="v3-preview/users-access/access-scopes" element={<UsersAccessScopesPageV3 />} />
            <Route path="v3-preview/attendance/calendar" element={<AttendanceCalendarPageV3 />} />
            <Route path="v3-preview/attendance/corrections" element={<AttendanceCorrectionsPageV3 />} />
            <Route path="v3-preview/attendance/devices" element={<AttendanceDevicesPageV3 />} />
            <Route path="v3-preview/attendance/reports" element={<AttendanceReportsPageV3 />} />
            <Route path="v3-preview/attendance/settings" element={<AttendanceSettingsPageV3 />} />
            <Route path="search" element={<SearchResultsPage />} />
            <Route path="help" element={<AdminHelpGuidePage />} />
            <Route path="notifications" element={<NotificationCenterPage />} />
            <Route path="employees" element={<EmployeesPageV3 />} />
            <Route path="employees/setup" element={<EmployeeSetupListPageV3 />} />
            <Route path="employees/kyc-requests" element={<KycRequestsPageV3 />} />
            <Route path="employees/settings" element={<EmployeeSettingsPageV3 />} />
            <Route path="employees/:id" element={<EmployeeProfilePageV3 />} />
            <Route path="onboarding" element={operational("onboarding", "Onboarding", <OnboardingListPageV3 />)} />
            <Route path="onboarding/cases" element={operational("onboarding", "Onboarding", <OnboardingListPageV3 />)} />
            <Route path="onboarding/history" element={operational("onboarding", "Onboarding history", <OnboardingListPageV3 />)} />
            <Route path="onboarding/alerts" element={operational("onboarding", "Onboarding", <OnboardingAlertsPageV3 />)} />
            <Route path="onboarding/settings" element={<LifecycleSettingsPageV3 kind="onboarding" />} />
            <Route path="onboarding/:caseId" element={operational("onboarding", "Onboarding", <OnboardingCaseWorkspacePageV3 />)} />
            <Route path="offboarding" element={operational("offboarding", "Offboarding", <OffboardingListPageV3 />)} />
            <Route path="offboarding/cases" element={operational("offboarding", "Offboarding", <OffboardingListPageV3 />)} />
            <Route path="offboarding/settings" element={<LifecycleSettingsPageV3 kind="offboarding" />} />
            <Route path="offboarding/:caseId" element={operational("offboarding", "Offboarding", <OffboardingCaseWorkspacePageV3 />)} />
            <Route path="lifecycle/reports" element={<ReportsPageV3 />} />
            <Route path="contracts" element={operational("contracts", "Contracts", <ContractsListPageV3 />)} />
            <Route path="contracts/types" element={operational("contracts", "Contracts", <ContractsTypesPageV3 />)} />
            <Route path="contracts/probation" element={operational("contracts", "Contracts", <ContractsProbationPageV3 />)} />
            <Route path="contracts/renewals" element={operational("contracts", "Contracts", <ContractsRenewalsPageV3 />)} />
            <Route path="contracts/alerts" element={operational("contracts", "Contracts", <ContractsAlertsPageV3 />)} />
            <Route path="approvals" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="inbox" />)} />
            <Route path="approvals/submitted" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="submitted" />)} />
            <Route path="approvals/overdue" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="overdue" />)} />
            <Route path="approvals/escalated" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="escalated" />)} />
            <Route path="approvals/delegated" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="delegated" />)} />
            <Route path="approvals/history" element={operational("approvals", "Approvals", <ApprovalInboxPageV3 mode="history" />)} />
            <Route path="approvals/workflows" element={<ApprovalWorkflowsPageV3 />} />
            <Route path="approvals/settings" element={<ApprovalSettingsPageV3 />} />
            <Route path="approvals/delegations" element={operational("approvals", "Approvals", <ApprovalDelegationsPageV3 />)} />
            <Route path="approvals/templates" element={<ApprovalTemplatesPageV3 />} />
            <Route path="approvals/reports" element={operational("approvals", "Approvals", <ApprovalReportsPageV3 />)} />
            <Route path="attendance" element={operational("attendance", "Attendance", <AttendanceListPageV3 />)} />
            <Route path="attendance/records" element={operational("attendance", "Attendance", <AttendanceListPageV3 />)} />
            <Route path="attendance/calendar" element={operational("attendance", "Attendance", <AttendanceCalendarPageV3 />)} />
            <Route path="attendance/corrections" element={operational("attendance", "Attendance", <AttendanceCorrectionsPageV3 />)} />
            <Route path="attendance/devices" element={operational("zkteco_attendance", "ZKTeco attendance", <AttendanceDevicesPageV3 />)} />
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
            <Route path="attendance/reports" element={operational("attendance", "Attendance", <AttendanceReportsPageV3 />)} />
            <Route path="attendance/settings" element={<AttendanceSettingsPageV3 />} />
            <Route path="attendance/:employeeId" element={operational("attendance", "Attendance", <AttendanceEmployeeCalendarPageV3 />)} />
            <Route path="leave" element={operational("leave", "Leave", <LeaveRequestsPageV3 />)} />
            <Route path="leave/requests" element={operational("leave", "Leave", <LeaveRequestsPageV3 />)} />
            <Route path="leave/approvals" element={operational("leave", "Leave", <LeaveRequestsPageV3 approvalsOnly />)} />
            <Route path="leave/calendar" element={operational("leave", "Leave", <LeaveCalendarPageV3 />)} />
            <Route path="leave/balances" element={operational("leave", "Leave", <LeaveBalancesPageV3 />)} />
            <Route path="leave/types-policies" element={operational("leave", "Leave", <LeaveTypesPoliciesPageV3 />)} />
            <Route path="leave/document-rules" element={operational("leave", "Leave", <LeaveDocumentRulesPageV3 />)} />
            <Route path="leave/deduction-rules" element={operational("leave", "Leave", <LeaveDeductionRulesPageV3 />)} />
            <Route path="leave/settings" element={operational("leave", "Leave", <LeaveTypesPoliciesPageV3 />)} />
            <Route path="leave/workflows" element={operational("leave", "Leave", <LeaveWorkflowsPageV3 />)} />
            <Route path="payroll" element={operational("payroll", "Payroll", <PayrollDashboardPageV3 />)} />
            <Route path="payroll/periods" element={operational("payroll", "Payroll", <PayrollPeriodsPageV3 />)} />
            <Route path="payroll/runs" element={operational("payroll", "Payroll", <PayrollRunsListPageV3 />)} />
            <Route path="payroll/runs/:runId" element={operational("payroll", "Payroll", <PayrollRunDetailPageV3 />)} />
            <Route path="payroll/advances" element={operational("payroll_employee_advances", "Employee advances", <PayrollAdvancesPageV3 />)} />
            <Route path="payroll/deductions" element={operational("payroll", "Payroll", <PayrollDeductionsPageV3 />)} />
            <Route path="payroll/adjustments" element={operational("payroll_adjustments", "Payroll adjustments", <PayrollAdjustmentsPageV3 />)} />
            <Route path="payroll/components" element={operational("payroll", "Payroll", <PayrollComponentsPageV3 />)} />
            <Route path="payroll/payslips" element={operational("payroll_payslips", "Payslips", <PayrollPayslipsPageV3 />)} />
            <Route path="payroll/payment-register" element={operational("payroll_payment_register", "Payment register", <PayrollPaymentRegisterPageV3 />)} />
            <Route path="payroll/payment-institutions" element={operational("payroll_payment_institutions", "Payment institutions", <PayrollInstitutionsPageV3 />)} />
            <Route path="payroll/bank-loans" element={operational("payroll_bank_loans", "Bank loans", <PayrollBankLoansPageV3 />)} />
            <Route path="payroll/custom-deductions" element={operational("payroll_custom_deductions", "Custom deductions", <PayrollCustomDeductionsPageV3 />)} />
            <Route path="payroll/pension" element={operational("payroll_pension", "Pension", <PayrollPensionPageV3 />)} />
            <Route path="payroll/history" element={operational("payroll", "Payroll", <PayrollHistoryPageV3 />)} />
            <Route path="payroll/exit-payroll" element={operational("final_settlement", "Final settlement", <PayrollFinalSettlementPageV3 />)} />
            <Route path="payroll/settings" element={<PayrollSettingsPageV3 />} />
            <Route path="payroll/reports" element={operational("payroll_reports", "Payroll reports", <PayrollReportsPageV3 />)} />
            <Route path="roster" element={operational("roster", "Roster", <RosterWeeklyPageV3 />)} />
            <Route path="roster/weekly" element={operational("roster", "Roster", <RosterWeeklyPageV3 />)} />
            <Route path="roster/shift-templates" element={operational("roster", "Roster", <RosterShiftTemplatesPageV3 />)} />
            <Route path="roster/reports" element={operational("roster", "Roster", <RosterReportsPageV3 />)} />
            <Route path="roster/settings" element={<RosterSettingsPageV3 />} />
            <Route path="documents" element={operational("documents", "Documents", <DocumentsRegistryPageV3 />)} />
            <Route path="documents/registry" element={operational("documents", "Documents", <DocumentsRegistryPageV3 />)} />
            <Route path="documents/missing" element={operational("documents", "Documents", <DocumentsMissingPageV3 />)} />
            <Route path="documents/compliance" element={operational("documents", "Documents", <DocumentsCompliancePageV3 />)} />
            <Route path="documents/compliance/missing" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="missing" />)} />
            <Route path="documents/compliance/expiring" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="expiring" />)} />
            <Route path="documents/compliance/expired" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="expired" />)} />
            <Route path="documents/compliance/alerts" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="alerts" />)} />
            <Route path="documents/compliance/renewal-cases" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="renewal-cases" />)} />
            <Route path="documents/compliance/waivers" element={operational("documents", "Documents", <DocumentsCompliancePageV3 mode="waivers" />)} />
            <Route path="assets" element={operational("assets_uniforms", "Assets and uniforms", <AssetsDashboardPageV3 />)} />
            <Route path="assets/items" element={operational("assets_uniforms", "Assets and uniforms", <AssetsItemsPageV3 />)} />
            <Route path="assets/assignments" element={operational("assets_uniforms", "Assets and uniforms", <AssetAssignmentsPageV3 />)} />
            <Route path="assets/uniforms" element={operational("assets_uniforms", "Assets and uniforms", <AssetUniformInventoryPageV3 />)} />
            <Route path="assets/uniform-assignments" element={operational("assets_uniforms", "Assets and uniforms", <AssetUniformAssignmentsPageV3 />)} />
            <Route path="assets/uniform-types" element={operational("assets_uniforms", "Assets and uniforms", <AssetUniformTypesPageV3 />)} />
            <Route path="assets/categories" element={operational("assets_uniforms", "Assets and uniforms", <AssetCategoriesPageV3 />)} />
            <Route path="assets/deduction-rules" element={operational("assets_uniforms", "Assets and uniforms", <AssetDeductionRulesPageV3 />)} />
            <Route path="assets/settings" element={<AssetUniformSettingsPageV3 />} />
            <Route path="assets/reports" element={operational("assets_uniforms", "Assets and uniforms", <AssetsReportsPageV3 />)} />
            <Route path="reports" element={operational(["reports", "reports_exports"], "Reports", <ReportsPageV3 />)} />
            <Route path="reports/audit" element={<AuditLogPage />} />
            <Route path="self-service" element={operational("self_service", "Self-service", <SelfServiceHomePage />)} />
            <Route path="self-service/profile" element={operational("self_service", "Self-service", <SelfServiceProfilePage />)} />
            <Route path="self-service/documents" element={operationalAll(["self_service", "documents"], "Documents", <SelfServiceDocumentsPage />)} />
            <Route path="self-service/attendance" element={operationalAll(["self_service", "attendance"], "Attendance", <SelfServiceAttendancePage />)} />
            <Route path="self-service/leave" element={operationalAll(["self_service", "leave"], "Leave", <SelfServiceLeavePage />)} />
            <Route path="self-service/roster" element={operationalAll(["self_service", "roster"], "Roster", <SelfServiceRosterPage />)} />
            <Route path="self-service/payroll" element={operationalAll(["self_service", "payroll"], "Payroll", <SelfServicePayrollPage />)} />
            <Route path="self-service/payment-methods" element={operationalAll(["self_service", "payroll", "payroll_payment_methods"], "Payment methods", <SelfServicePaymentMethodsPage />)} />
            <Route path="self-service/bank-loans" element={operationalAll(["self_service", "payroll", "payroll_bank_loans"], "Bank loans", <SelfServiceBankLoansPage />)} />
            <Route path="self-service/pension" element={operationalAll(["self_service", "payroll", "payroll_pension"], "Pension", <SelfServicePensionPage />)} />
            <Route path="self-service/contracts" element={operationalAll(["self_service", "contracts"], "Contracts", <SelfServiceContractsPage />)} />
            <Route path="self-service/onboarding" element={operationalAll(["self_service", "onboarding"], "Onboarding", <SelfServiceOnboardingPage />)} />
            <Route path="self-service/offboarding" element={operationalAll(["self_service", "offboarding"], "Offboarding", <SelfServiceOffboardingPage />)} />
            <Route path="self-service/assets" element={operationalAll(["self_service", "assets_uniforms"], "Assets and uniforms", <SelfServiceAssetsPage />)} />
            <Route path="self-service/uniforms" element={operationalAll(["self_service", "assets_uniforms"], "Assets and uniforms", <SelfServiceUniformsPage />)} />
            <Route path="self-service/approvals" element={operationalAll(["self_service", "approvals"], "Approvals", <SelfServiceApprovalsPage />)} />
            <Route path="self-service/notifications" element={operationalAll(["self_service", "notifications"], "Notifications", <SelfServiceNotificationsPage />)} />
            <Route path="self-service/kyc-requests" element={operationalAll(["self_service", "documents"], "KYC requests", <SelfServiceKycPage />)} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/admin" element={<AdminSettingsPage />} />
            <Route path="settings/admin/backup-retention" element={<AdminBackupRetentionPage />} />
            <Route path="settings/performance" element={<PerformanceDashboardPage />} />
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
            <Route path="audit" element={<AuditLogPageV3 />} />
            <Route path="users-access" element={<UsersAccessUsersPageV3 />} />
            <Route path="users-access/users" element={<UsersAccessUsersPageV3 />} />
            <Route path="users-access/roles" element={<UsersAccessRolesPageV3 />} />
            <Route path="users-access/permissions" element={<UsersAccessPermissionsPageV3 />} />
            <Route path="users-access/role-mappings" element={<UsersAccessRoleMappingsPageV3 />} />
            <Route path="users-access/access-scopes" element={<UsersAccessScopesPageV3 />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
