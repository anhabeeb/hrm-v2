# Admin Configuration Guide

## Employee 360 Setup Rollout Controls

Employee 360 setup is the primary activation path. Admins can run `npm run migrate:onboarding-to-employee360-setup` as a dry run, then enable write mode only with `HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360=true` and `HRM_MIGRATE_CONFIRM=YES`. Do not activate employees from migration scripts; activation remains controlled by Employee 360 final verification.

## Recommended Initial Configuration Order

1. Login and Super Admin access: confirm at least one protected Owner or Super Admin can sign in. Do not share Super Admin accounts.
2. Company and organization setup: configure company profile, default currency, timezone, locations, departments, job levels, and positions.
3. Departments: create active departments such as HR, Finance, Operations, Kitchen, Service, and IT.
4. Job levels: create active levels before positions so cascading validation has valid choices.
5. Positions: create positions under the correct department and job level.
6. Locations and branches: create active worksites/outlets and assign manager foundations where available.
7. Employment types: confirm local, foreign, full-time, part-time, temporary, contract, intern, and other categories used by the company.
8. Role and permission mappings: configure roles, categorized permissions, recommended mappings, and access scopes.
9. Module toggles: enable only modules the company will operate.
10. Submodule toggles: configure child features after the parent module is enabled.
11. Employee profile setup: configure statuses, numbering, assignment options, profile update rules, and employee self-service behavior.
12. Document types: configure Passport, Visa, Work Permit, ID Card, Employment Contract, Medical, Insurance, Police Report, Driving License, and custom documents.
13. Document required rules: configure local, foreign, other, and any-scope rules.
14. Payroll foundations: configure payroll settings, salary components, cutoffs, payment methods, pension, bank loans, advances, custom deductions, and reports.
15. Payment institutions and banks: configure active banks such as BML, MIB, SBI, BOC, MCB, HBL, and CBM.
16. Attendance settings: configure grace minutes, manual entries, correction rules, device/import rules, and payroll lock behavior.
17. Leave settings: configure leave types, policies, document thresholds, deduction modes, cycles, ledger, and approval workflows.
18. Roster settings: configure week start, shift templates, publish rules, cross-worksite permissions, and roster-aware leave behavior.
19. Approval workflows: configure central approvals and module-specific workflows.
20. Onboarding readiness: configure required employee setup sections and activation rules.
21. Self-service setup: enable only employee-facing modules the company wants to expose.
22. Reports/import/export setup: configure import templates, export controls, and report permissions.
23. Background jobs/performance dashboard: review job drawer and performance metrics access.
24. Production maintenance: run readiness, security, schema, and smoke checks before production use.

## Dependencies

- Department -> Job Level -> Position cascading validation is used in employee assignment and some configuration forms.
- Parent module disabled -> child submodules inactive and greyed out.
- Disabled modules disappear from operational UI and direct operational routes are blocked.
- Settings remain available for authorized users so modules can be re-enabled.
- Payroll can work without Attendance.
- Attendance disabled means Payroll must not use Attendance records, late penalties, missed punches, or attendance-based days worked.

## Safe Sample Setup

- Currency: MVR
- Timezone: Indian/Maldives
- Payroll period: 1st to month end
- Salary payment date: 10th of next month
- Local employee documents: ID Card, Employment Contract, Medical if configured
- Foreign employee documents: Passport, Visa, Work Permit, Employment Contract
