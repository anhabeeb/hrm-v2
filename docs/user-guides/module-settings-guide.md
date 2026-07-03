# Module Settings Guide

## Core Module Toggle Behavior

Main module toggles control whether a feature appears in operational navigation and whether direct operational routes/API actions are available.

## Submodule Toggle Behavior

Submodule toggles control narrower features under a parent module. Parent disabled -> children inactive. Child toggles are greyed out while parent disabled.

## UI and API Behavior

- Operational UI hides disabled modules.
- Direct routes are blocked for disabled operational modules.
- Backend APIs enforce disabled-module behavior.
- Settings remain available for authorized admins.
- Onboarding and offboarding treat disabled optional modules as Not Required.
- Import, export, search, notifications, and reports filter disabled modules where applicable.

## Examples

- Attendance disabled: Attendance pages hide. Payroll, Leave, and Roster remain available if enabled. Payroll must not use attendance data.
- Payroll disabled: Payroll pages, payroll reports, payment methods, pension, bank loans, and payslips hide.
- Documents disabled: document registry, compliance, renewal, and upload workflows hide or become Not Required.
- Assets & Uniforms disabled: asset/uniform operational pages hide and onboarding/offboarding clearance becomes Not Required.
- Self-service disabled: employee portal sections are hidden from employee users.

