# Onboarding Section Status Diagnostics

Generated at: 2026-07-05T16:16:32.342Z

## Source Checks

- Table present in schema: PASS
- Unique case/section protection: PASS
- Helper module present: PASS
- Section-scoped evaluator present: PASS
- Save integration helper present: PASS
- Save response payload present: PASS
- Frontend applies save payload: PASS
- Registry section count: 12
- Expected section list: employee_info, contact_emergency, job_assignment, contract, documents, payroll_profile, payment_method, pension, user_access, attendance_roster, assets_uniforms, approval_tasks
- Missing registry sections: none

## Runtime Case Inspection

Status: SKIPPED

Set `HRM_DIAG_CASE_ID` to inspect one onboarding case. This diagnostic does not query production data without an explicit case id.

## Shadow Comparison Notes

- The Phase 1 section readiness system is shadow/read-only.
- Phase 2 save integration updates only affected section statuses after successful section commits.
- Use the timestamp query to verify the latest saved/evaluated section rows after each onboarding save.
- Candidate readiness from section statuses must not enable activation.
- Missing setup should appear as blocked/incomplete, while failed is reserved for system/checker failures.
- Do not include payroll amounts, bank account values, document numbers, file contents, passwords, tokens, or raw SQL errors in diagnostic output.

