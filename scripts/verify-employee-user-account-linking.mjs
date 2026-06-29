import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readOptional = (file) => fs.existsSync(path.join(root, file)) ? read(file) : "";

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

const employeeRoutes = read("worker/src/routes/employees.ts");
const lifecycleRoutes = read("worker/src/routes/lifecycle.ts");
const usersRoutes = read("worker/src/routes/users.ts");
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const permissions = read("worker/src/db/permissions.ts");
const api = read("frontend/src/lib/api.ts");
const employeeProfile = read("frontend/src/pages/EmployeeProfilePage.tsx");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const usersAccess = read("frontend/src/pages/UsersAccessPage.tsx");
const selfService = read("worker/src/routes/self-service.ts");
const selfServicePage = read("frontend/src/pages/SelfServicePage.tsx");
const dataTransferRoutes = readOptional("worker/src/routes/data-transfer.ts");
const wrangler = read("worker/wrangler.toml");
const packageJson = read("package.json");

function selfServiceRouteBlock(method, route) {
  const marker = `selfServiceRoutes.${method}("${route}"`;
  const start = selfService.indexOf(marker);
  if (start < 0) return "";
  const next = selfService.indexOf("\nselfServiceRoutes.", start + marker.length);
  return selfService.slice(start, next < 0 ? selfService.length : next);
}

const activeSelfServiceGuardRoutes = [
  ["get", "/dashboard"],
  ["get", "/profile"],
  ["get", "/profile/update-requests"],
  ["post", "/profile/update-requests"],
  ["post", "/profile/update-requests/:requestId/cancel"],
  ["get", "/documents"],
  ["get", "/documents/warnings"],
  ["get", "/attendance"],
  ["get", "/attendance/summary"],
  ["get", "/attendance/calendar"],
  ["get", "/attendance/daily-records"],
  ["get", "/attendance/corrections"],
  ["post", "/attendance/corrections"],
  ["post", "/attendance/correction-requests"],
  ["get", "/leave"],
  ["get", "/leave/summary"],
  ["get", "/leave/balances"],
  ["get", "/leave/requests"],
  ["post", "/leave/requests"],
  ["get", "/leave/requests/:requestId"],
  ["post", "/leave/requests/:requestId/cancel"],
  ["get", "/roster"],
  ["get", "/roster/weekly"],
  ["get", "/roster/upcoming"],
  ["get", "/roster/week"],
  ["get", "/payroll"],
  ["get", "/payroll/summary"],
  ["get", "/payroll/history"],
  ["get", "/payroll/payslips"],
  ["get", "/payslips"],
  ["get", "/payslips/:payslipId"],
  ["get", "/payslips/:payslipId/preview"],
  ["get", "/payslips/:payslipId/download"],
  ["get", "/assets"],
  ["get", "/requests"],
  ["get", "/approvals"],
  ["get", "/notifications"],
  ["post", "/notifications/:notificationId/read"],
  ["post", "/notifications/mark-all-read"],
  ["get", "/kyc-requests"],
  ["post", "/kyc-requests"]
];

const activeGuardRouteFailures = activeSelfServiceGuardRoutes.filter(([method, route]) => {
  const block = selfServiceRouteBlock(method, route);
  return !block || block.includes("requireLinkedEmployee(c)") || !block.includes("requireSelfServiceEmployeeContext(c)");
});

check("GET employee user account endpoint exists", employeeRoutes.includes('employeeRoutes.get("/:id/user-account"'));
check("link existing user endpoint exists", employeeRoutes.includes('user-account/link-existing'));
check("provision user account endpoint exists", employeeRoutes.includes('user-account/provision'));
check("update user account endpoint exists", employeeRoutes.includes('employeeRoutes.patch("/:id/user-account"'));
check("unlink user account endpoint exists", employeeRoutes.includes('user-account/unlink'));
check("deactivate for exit endpoint exists", employeeRoutes.includes('user-account/deactivate-for-exit'));
check("dual employee/user link updates employees.user_id", /UPDATE employees SET user_id = \?/.test(employeeRoutes));
check("dual employee/user link updates users.employee_id", /UPDATE users SET employee_id = \?/.test(employeeRoutes));
check("duplicate employee/user link validation exists", employeeRoutes.includes("validateEmployeeUserLink") && employeeRoutes.includes("USER_ALREADY_LINKED") && employeeRoutes.includes("EMPLOYEE_ALREADY_LINKED"));
check("protected owner handling exists", employeeRoutes.includes("LAST_ACTIVE_OWNER") && employeeRoutes.includes("getActiveOwnerCount"));
check("password hashing used for provisioning", employeeRoutes.includes("hashPassword(generatedPassword)") && !employeeRoutes.includes("password_hash = generatedPassword"));
check("self-only scope ensured", employeeRoutes.includes("ensureSelfOnlyScopeForUser") && employeeRoutes.includes("'SELF_ONLY'"));
check("onboarding user access task is updated", employeeRoutes.includes("markUserAccessOnboardingTask") && employeeRoutes.includes("user_access_setup"));
check("audit events exist", ["employee.user_account.linked", "employee.user_account.provisioned", "employee.user_account.updated", "employee.user_account.unlinked", "employee.user_account.deactivated_for_exit"].every((marker) => employeeRoutes.includes(marker)));
check("realtime employee access event exists", employeeRoutes.includes("employee.access.changed") && employeeRoutes.includes("users.roles.changed"));
check("schema has users.employee_id", /CREATE TABLE IF NOT EXISTS users[\s\S]*employee_id TEXT/.test(schema));
check("schema has employees.user_id", /CREATE TABLE IF NOT EXISTS employees[\s\S]*user_id TEXT/.test(schema));
check("schema has unique users.employee_id guard", schema.includes("idx_users_employee_unique"));
check("schema has unique employees.user_id guard", schema.includes("idx_employees_user_unique"));
check("schema has employee user account link history", schema.includes("CREATE TABLE IF NOT EXISTS employee_user_account_links") && schema.includes("invite_status") && schema.includes("reset_required") && schema.includes("employee_email_used"));
check("new permissions are seeded", ["users.link_employee", "users.unlink_employee", "users.assign_roles", "users.assign_scopes", "employee.user_account.view", "employee.user_account.manage", "self_service.manage_access"].every((marker) => seed.includes(marker) && permissions.includes(marker)));
check("frontend API helpers exist", ["getEmployeeUserAccount", "linkEmployeeExistingUser", "provisionEmployeeUserAccount", "updateEmployeeUserAccount", "unlinkEmployeeUserAccount", "deactivateEmployeeUserForExit"].every((marker) => api.includes(marker)));
check("Employee 360 uses real user account API", employeeProfile.includes("api.getEmployeeUserAccount") && employeeProfile.includes("api.provisionEmployeeUserAccount") && employeeProfile.includes("api.linkEmployeeExistingUser"));
check("Employee 360 can unlink and deactivate", employeeProfile.includes("api.unlinkEmployeeUserAccount") && employeeProfile.includes("api.deactivateEmployeeUserForExit"));
check("Employee 360 still supports suggested role mapping", employeeProfile.includes("api.applyEmployeeRoleMapping") && employeeProfile.includes("Apply suggested role + scope"));
check("Employee 360 exposes scope assignment", employeeProfile.includes("ScopeChecklist") && employeeProfile.includes("available_access_scopes") && employeeProfile.includes("access_scope_ids"));
check("Employee 360 exposes invite reset state", employeeProfile.includes("Invite/reset") && employeeProfile.includes("Require reset / invite placeholder"));
check("Employee 360 prefills employee email", employeeProfile.includes("employeeEmail?.email") && employeeProfile.includes("Using employee email from profile"));
check("backend provision uses employee email fallback", employeeRoutes.includes("getEmployeeEmailSuggestion") && employeeRoutes.includes("const email = requestedEmail || employeeEmail.email") && employeeRoutes.includes("EMAIL_EXISTS_LINK_EXISTING"));
check("backend validates duplicate email and linked employee", employeeRoutes.includes("EMAIL_LINKED_TO_ANOTHER_EMPLOYEE") && employeeRoutes.includes("EMAIL_ALREADY_LINKED_TO_EMPLOYEE") && employeeRoutes.includes("LINK_EXISTING_USER"));
check("backend exposes invite reset status and link history", employeeRoutes.includes("link_history") && employeeRoutes.includes("invite_status") && employeeRoutes.includes("reset_required") && employeeRoutes.includes("account_email_created"));
check("backend validates roles and scopes before provisioning", employeeRoutes.indexOf("validateRolesForEmployeeUserAccount") < employeeRoutes.indexOf("INSERT INTO users") && employeeRoutes.indexOf("prepareUserAccessScopeAssignments") < employeeRoutes.indexOf("INSERT INTO users"));
check("provision/link/update support access scope ids", ["link-existing", "provision", "patch"].every((marker) => employeeRoutes.includes(marker)) && employeeRoutes.includes("access_scope_ids") && employeeRoutes.includes("validateAccessScope") && employeeRoutes.includes("applyPreparedUserAccessScopes"));
check("passwordless provisioning uses invite reset state", employeeRoutes.includes("INVITE_RESET_PENDING") && employeeRoutes.includes("reset_required") && employeeRoutes.includes("passwordlessInvite") && employeeRoutes.includes("generatedPassword"));
check("onboarding user-account endpoint performs real link/provision", lifecycleRoutes.includes('onboardingRoutes.post("/cases/:caseId/user-account"') && lifecycleRoutes.includes('action === "link_existing"') && lifecycleRoutes.includes('action === "provision_new"') && lifecycleRoutes.includes("upsertLifecycleUserAccountLink") && lifecycleRoutes.includes("setOnboardingTaskState"));
check("onboarding user setup assigns roles and scopes", lifecycleRoutes.includes("assignLifecycleRoles") && lifecycleRoutes.includes("prepareLifecycleAccessScopes") && lifecycleRoutes.includes("applyLifecycleAccessScopes") && lifecycleRoutes.includes("ensureLifecycleSelfOnlyScope"));
check("onboarding provisioning uses employee email", lifecycleRoutes.includes("lifecycleEmployeeEmailSuggestion") && lifecycleRoutes.includes("const email = requestedEmail || employeeEmail.email") && lifecycleRoutes.includes("EMAIL_EXISTS_LINK_EXISTING"));
check("onboarding UI offers provision and link actions", lifecyclePage.includes("Provision user account") && lifecyclePage.includes("Link existing user") && lifecyclePage.includes('submit(action: "provision_new" | "link_existing" | "defer" | "not_required")') && lifecyclePage.includes('if (action === "provision_new")') && lifecyclePage.includes('if (action === "link_existing")'));
check("onboarding UI exposes scopes and employee email recommendation", lifecyclePage.includes("available_access_scopes") && lifecyclePage.includes("OnboardingRoleScopeChecklist") && lifecyclePage.includes("employeeEmail"));
check("offboarding readiness enforces user access deactivation", lifecycleRoutes.includes("getOffboardingUserAccessBlockers") && lifecycleRoutes.includes("deactivateEmployeeUserAccessForOffboarding") && lifecycleRoutes.includes("employee.user_account.deactivated_for_exit"));
check("offboarding finalization deactivates linked access", lifecycleRoutes.includes("finalizeEmployeeExitFromOffboarding") && lifecycleRoutes.includes("const accessResult = await deactivateEmployeeUserAccessForOffboarding"));
check("offboarding UI shows deactivation action", lifecyclePage.includes("OffboardingUserAccessPanel") && lifecyclePage.includes("Deactivate linked access") && lifecyclePage.includes("api.deactivateEmployeeUserForExit"));
check("Users & Access lists linked employee details", usersRoutes.includes("employee_no") && usersRoutes.includes("employee_name") && usersAccess.includes("employee_name") && usersAccess.includes("Employee link"));
check("operational self-service routes use active employee context", activeGuardRouteFailures.length === 0);
check("weak linked-only self-service guard is not used", !selfService.includes("requireLinkedEmployee("));
check("self-service active context checks can_login", selfService.includes("INNER JOIN employee_statuses es ON es.id = e.status_id AND es.can_login = 1"));
check("self-service active context blocks archived employees", selfService.includes("WHERE e.id = ? AND e.archived_at IS NULL"));
check("/me exposes linked and active availability state", selfService.includes("linked_employee") && selfService.includes("active_employee") && selfService.includes("self_service_available") && selfService.includes("unavailable_message"));
check("frontend shows clean self-service unavailable state", selfServicePage.includes("SELF_SERVICE_UNAVAILABLE") && selfServicePage.includes("Self-service is unavailable because your account is not linked to an active employee profile."));
check("post-offboarding self-service data remains guarded", lifecycleRoutes.includes("deactivateEmployeeUserAccessForOffboarding") && activeGuardRouteFailures.length === 0);
check("related post-production verifier scripts remain wired", ["verify:import-export-standardization", "verify:button-color-standardization", "verify:frontend-static-assets", "verify:frontend-bundle-integrity", "verify:filter-search-date-standardization", "verify:command-center-dashboard"].every((marker) => packageJson.includes(marker)));
check("no generic employee import silently creates users", !dataTransferRoutes.includes("INSERT INTO users"));
check("no browser alert confirm prompt in changed UI", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(employeeProfile) && !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecyclePage) && !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(usersAccess) && !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(selfServicePage));
check("PBKDF2 iterations remain 100000", read("worker/src/auth/password.ts").includes("PBKDF2_ITERATIONS = 100000"));
check("D1 binding unchanged", wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('bucket_name = "hrm-v2-documents"'));

const failed = checks.filter((item) => !item.condition);
if (failed.length) {
  console.error("Employee user account linking verifier failed:");
  for (const item of failed) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log(`Employee user account linking verifier passed (${checks.length} checks).`);
