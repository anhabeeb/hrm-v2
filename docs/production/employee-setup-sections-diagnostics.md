# Employee 360 Setup Sections Diagnostics

Generated at: 2026-07-05T22:06:41.313Z

## Source Checks

- Table present in schema: PASS
- Unique employee/section protection: PASS
- Employee status seed includes PENDING_SETUP: PASS
- Registry section count: 13
- Expected section list: profile_information, contact_emergency, job_assignment, documents, contract, payroll_profile, payment_method, pension, user_access, attendance_roster, assets_uniforms, approval_tasks, final_verification
- Missing registry sections: none
- Helper module present: PASS
- Setup-readiness endpoint present: PASS
- Setup-sections rebuild endpoint present: PASS
- Employee 360 preview panel present: PASS
- Activation remains preview-only: PASS
- latest status update timestamps: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- stale sections: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- failed sections: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- missing required section rows: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- duplicate section rows: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- setup readiness summary: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided
- recent employee save/update events: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided

## Runtime Employee Inspection

Status: SKIPPED

Set `HRM_DIAG_EMPLOYEE_ID` to inspect one employee. This diagnostic does not query production data without an explicit employee id.

## Phase 1 Notes

- Employee 360 setup readiness is a shadow preview in this phase.
- The old onboarding module and activation verifier remain the production activation authority.
- Missing setup should appear as blocked/incomplete, while failed is reserved for system checker failures.
- Disabled modules or disabled submodules should mark dependent sections as not required.
- Do not include payroll amounts, bank account values, document numbers, file contents, passwords, tokens, or raw SQL errors in diagnostic output.

