-- Phase 21 additive-only remote D1 repair.;

-- Review before running. Back up remote D1 first. Run in staging first when possible.;

-- Allowed statement types: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ALTER TABLE ADD COLUMN.;

-- This file intentionally contains no DROP, DELETE, UPDATE, INSERT, table rebuild, or seed statements.;

-- Missing table: data_retention_policies;

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  retention_days INTEGER CHECK (retention_days IS NULL OR retention_days >= 0),
  applies_to TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_key ON data_retention_policies(policy_key);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_enabled ON data_retention_policies(is_enabled, applies_to);

CREATE INDEX IF NOT EXISTS idx_phase20_bank_loan_payments_result ON employee_bank_loan_payments(payroll_employee_result_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_phase20_pension_contributions_result ON payroll_pension_contributions(payroll_employee_result_id, contribution_status);
