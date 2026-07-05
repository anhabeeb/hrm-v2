# Onboarding Section Readiness Aggregator Diagnostics

Generated: 2026-07-05T17:38:30.772Z
Case ID: not provided
Legacy comparison requested: no

## Source Checks

- PASS - Aggregator helper exists
- PASS - Retry endpoint uses section status aggregator
- PASS - Readiness status endpoint uses fast section readiness
- PASS - Frontend displays Setup Readiness
- PASS - Final verification remains required

## Runtime Diagnostic Plan

Set HRM_DIAG_CASE_ID to run a live one-case readiness diagnostic outside source-validation mode.

The normal readiness path should return section-status readiness, section rows, timing metadata, and activation_requires_final_verification=true without loading the full workspace.

## Safety

- This diagnostic script does not write D1 data.
- It does not activate employees.
- It does not print secrets or authentication tokens.
