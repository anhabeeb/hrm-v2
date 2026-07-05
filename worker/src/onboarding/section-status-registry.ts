export const ONBOARDING_SECTION_STATUS_VALUES = [
  "not_started",
  "incomplete",
  "complete",
  "blocked",
  "not_required",
  "failed",
  "stale",
  "verified"
] as const;

export type OnboardingSectionStatusValue = (typeof ONBOARDING_SECTION_STATUS_VALUES)[number];

export type OnboardingSectionDefinition = {
  section_key: string;
  section_label: string;
  display_order: number;
  default_required: boolean;
  module_dependency: string | null;
  submodule_dependency?: string | null;
  owns_fields: string[];
  stale_when_dependencies_change: string[];
  can_be_not_required: boolean;
  description: string;
  frontend_group_label: string;
  task_keys: string[];
  setting_key?: string | null;
};

export type OnboardingSectionDefinitionContext = {
  moduleStatuses?: Record<string, boolean>;
  settings?: Record<string, unknown> | null;
  employee?: Record<string, unknown> | null;
};

export const ONBOARDING_SECTION_DEFINITIONS: OnboardingSectionDefinition[] = [
  {
    section_key: "employee_info",
    section_label: "Employee Info",
    display_order: 10,
    default_required: true,
    module_dependency: "employees",
    owns_fields: ["full_name", "employee_type", "employment_type", "joining_date", "date_of_birth", "nationality"],
    stale_when_dependencies_change: ["employee_type", "employment_type", "joining_date"],
    can_be_not_required: false,
    description: "Core employee identity and employment attributes.",
    frontend_group_label: "Employee",
    task_keys: ["personal_info"],
    setting_key: "require_personal_info_before_activation"
  },
  {
    section_key: "contact_emergency",
    section_label: "Contact & Emergency",
    display_order: 20,
    default_required: false,
    module_dependency: "employees",
    owns_fields: ["employee_contacts", "employee_addresses", "emergency_contacts"],
    stale_when_dependencies_change: ["employee_contacts", "employee_addresses"],
    can_be_not_required: true,
    description: "Employee contact, address, and emergency contact readiness.",
    frontend_group_label: "Employee",
    task_keys: ["contact_info"],
    setting_key: "require_contact_info_before_activation"
  },
  {
    section_key: "job_assignment",
    section_label: "Job Assignment",
    display_order: 30,
    default_required: true,
    module_dependency: "employees",
    owns_fields: ["primary_department_id", "primary_location_id", "primary_position_id", "job_level_id", "reporting_manager_employee_id"],
    stale_when_dependencies_change: ["department", "location", "position", "job_level", "reporting_manager"],
    can_be_not_required: false,
    description: "Department, outlet/location, position, job level, and manager setup.",
    frontend_group_label: "Employee",
    task_keys: ["job_assignment"],
    setting_key: "require_job_assignment_before_activation"
  },
  {
    section_key: "contract",
    section_label: "Contract",
    display_order: 40,
    default_required: false,
    module_dependency: "contracts",
    owns_fields: ["employee_contracts", "contract_type_id", "contract_start_date", "contract_end_date", "probation_dates"],
    stale_when_dependencies_change: ["contract_settings", "contract_type", "employee_contracts"],
    can_be_not_required: true,
    description: "Employment contract and probation/confirmation readiness.",
    frontend_group_label: "Lifecycle",
    task_keys: ["contract"],
    setting_key: "require_contract_before_activation"
  },
  {
    section_key: "documents",
    section_label: "Documents",
    display_order: 50,
    default_required: true,
    module_dependency: "document_compliance",
    submodule_dependency: "documents",
    owns_fields: ["document_required_rules", "employee_documents", "document_waivers"],
    stale_when_dependencies_change: ["employee_type", "document_rule", "document_uploaded", "document_deleted"],
    can_be_not_required: true,
    description: "Required document compliance for local/foreign employee rules.",
    frontend_group_label: "Compliance",
    task_keys: ["documents"],
    setting_key: "require_documents_before_activation"
  },
  {
    section_key: "payroll_profile",
    section_label: "Payroll Profile",
    display_order: 60,
    default_required: true,
    module_dependency: "payroll",
    owns_fields: ["employee_payroll_profiles", "basic_salary", "payroll_included"],
    stale_when_dependencies_change: ["payroll_profile", "salary", "payroll_settings"],
    can_be_not_required: true,
    description: "Employee payroll profile readiness.",
    frontend_group_label: "Payroll",
    task_keys: ["payroll_profile"],
    setting_key: "require_payroll_profile_before_activation"
  },
  {
    section_key: "payment_method",
    section_label: "Payment Method",
    display_order: 70,
    default_required: false,
    module_dependency: "payment_methods",
    owns_fields: ["employee_payment_methods", "payment_institution_id", "bank_account_name", "bank_account_number"],
    stale_when_dependencies_change: ["payment_method", "payment_institution", "payroll_settings"],
    can_be_not_required: true,
    description: "Cash or Bank Transfer payment method readiness.",
    frontend_group_label: "Payroll",
    task_keys: ["payment_method"],
    setting_key: "require_payment_method_before_activation"
  },
  {
    section_key: "pension",
    section_label: "Pension",
    display_order: 80,
    default_required: false,
    module_dependency: "pension",
    owns_fields: ["employee_pension_profiles", "pension_scheme_id", "enrollment_status"],
    stale_when_dependencies_change: ["payment_method", "pension_settings", "pension_profile"],
    can_be_not_required: true,
    description: "Pension enrollment, exemption, or voluntary setup readiness.",
    frontend_group_label: "Payroll",
    task_keys: ["pension_profile"],
    setting_key: "require_pension_profile_if_eligible_before_activation"
  },
  {
    section_key: "user_access",
    section_label: "User Access",
    display_order: 90,
    default_required: false,
    module_dependency: "self_service",
    owns_fields: ["user_id", "employee_user_account_links", "roles", "access_scopes"],
    stale_when_dependencies_change: ["user_account_linked", "user_account_unlinked", "role_mapping"],
    can_be_not_required: true,
    description: "Linked user account and self-service access setup.",
    frontend_group_label: "Access",
    task_keys: ["user_access"],
    setting_key: "require_user_account_before_activation"
  },
  {
    section_key: "attendance_roster",
    section_label: "Attendance & Roster",
    display_order: 100,
    default_required: false,
    module_dependency: "attendance",
    submodule_dependency: "roster",
    owns_fields: ["roster_eligible", "joining_date", "employee_biometric_mappings"],
    stale_when_dependencies_change: ["attendance_settings", "roster_settings", "biometric_mapping", "job_assignment"],
    can_be_not_required: true,
    description: "Attendance start, biometric, and roster eligibility setup.",
    frontend_group_label: "Time",
    task_keys: ["attendance_biometric"],
    setting_key: "require_biometric_mapping_before_activation"
  },
  {
    section_key: "assets_uniforms",
    section_label: "Assets & Uniforms",
    display_order: 110,
    default_required: false,
    module_dependency: "assets_uniforms",
    owns_fields: ["employee_asset_assignments", "uniform_assignments"],
    stale_when_dependencies_change: ["asset_assignment", "uniform_assignment", "asset_settings"],
    can_be_not_required: true,
    description: "Required asset and uniform issue readiness.",
    frontend_group_label: "Operations",
    task_keys: ["assets_uniforms"],
    setting_key: "require_asset_uniform_issue_before_activation"
  },
  {
    section_key: "approval_tasks",
    section_label: "Approval Tasks",
    display_order: 120,
    default_required: true,
    module_dependency: "approvals",
    owns_fields: ["employee_onboarding_tasks", "approval_instance_id"],
    stale_when_dependencies_change: ["approval_workflow", "task_status"],
    can_be_not_required: true,
    description: "Final activation approval and required checklist task readiness.",
    frontend_group_label: "Approvals",
    task_keys: ["activation_approval"],
    setting_key: "require_approval_before_activation"
  }
];

const SETTING_FALLBACKS: Record<string, boolean> = {
  require_personal_info_before_activation: true,
  require_contact_info_before_activation: false,
  require_job_assignment_before_activation: true,
  require_contract_before_activation: false,
  require_documents_before_activation: true,
  require_payroll_profile_before_activation: true,
  require_payment_method_before_activation: false,
  require_pension_profile_if_eligible_before_activation: false,
  require_user_account_before_activation: false,
  require_biometric_mapping_before_activation: false,
  require_asset_uniform_issue_before_activation: false,
  require_approval_before_activation: true
};

function bool(value: unknown, fallback: boolean) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

export function isOnboardingSectionModuleEnabled(definition: OnboardingSectionDefinition, moduleStatuses: Record<string, boolean> = {}) {
  const moduleEnabled = definition.module_dependency ? moduleStatuses[definition.module_dependency] !== false : true;
  if (!moduleEnabled) return false;
  if (definition.submodule_dependency && moduleStatuses[definition.submodule_dependency] === false) return false;
  if (definition.section_key === "attendance_roster") {
    return moduleStatuses.attendance !== false || moduleStatuses.roster !== false;
  }
  return true;
}

export function getOnboardingSectionRegistry(context: OnboardingSectionDefinitionContext = {}) {
  const moduleStatuses = context.moduleStatuses ?? {};
  const settings = context.settings ?? {};
  return ONBOARDING_SECTION_DEFINITIONS.map((definition) => {
    const moduleEnabled = isOnboardingSectionModuleEnabled(definition, moduleStatuses);
    const requiredBySetting = definition.setting_key
      ? bool(settings[definition.setting_key], SETTING_FALLBACKS[definition.setting_key] ?? definition.default_required)
      : definition.default_required;
    const isRequired = moduleEnabled ? requiredBySetting : false;
    return {
      ...definition,
      default_required: isRequired
    };
  }).sort((a, b) => a.display_order - b.display_order);
}

export function onboardingSectionDefinitionByKey(sectionKey: string) {
  return ONBOARDING_SECTION_DEFINITIONS.find((definition) => definition.section_key === sectionKey) ?? null;
}
