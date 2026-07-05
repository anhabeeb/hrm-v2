# Onboarding Section Status Diagnostics

Generated at: 2026-07-05T15:02:00.886Z

## Source Checks

- Table present in schema: PASS
- Unique case/section protection: PASS
- Helper module present: PASS
- Registry section count: 12
- Missing registry sections: none

## Runtime Case Inspection

Status: SKIPPED

Set `HRM_DIAG_CASE_ID` to inspect one onboarding case. This diagnostic does not query production data without an explicit case id.

## Shadow Comparison Notes

- The Phase 1 section readiness system is shadow/read-only.
- Candidate readiness from section statuses must not enable activation.
- Missing setup should appear as blocked/incomplete, while failed is reserved for system/checker failures.
- Do not include payroll amounts, bank account values, document numbers, file contents, passwords, tokens, or raw SQL errors in diagnostic output.

