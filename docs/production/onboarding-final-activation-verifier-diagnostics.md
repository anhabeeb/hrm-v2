# Onboarding Final Activation Verifier Diagnostics

Generated: 2026-07-05T19:14:14.988Z
Case ID: not provided
Run rebuild requested: no
Legacy comparison requested: no

## Source Checks

- PASS - Final verifier service exists
- PASS - Final verifier has stale rebuild helper
- PASS - Final verifier marks passing sections verified
- PASS - Final verification endpoint exists
- PASS - Activation endpoints are guarded by final verifier
- PASS - Frontend calls explicit final verification before activation

## Runtime Diagnostic Plan

Set HRM_DIAG_CASE_ID to run a one-case live diagnostic outside source-validation mode.

## Expected Safe Behavior

- Section statuses may show Ready for final verification, but final activation still requires the backend verifier.
- Blocked business setup must return blockers, not a system failure.
- Failed system checks must include safe reason, next action, and request ID.
- This diagnostic does not write D1 data, does not activate employees, and does not print secrets.
