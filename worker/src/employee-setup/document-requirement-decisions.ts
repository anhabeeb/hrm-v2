import { nowIso } from "../utils/http";

type BindValue = string | number | null;

export type DocumentRequirementDecisionStatus =
  | "required"
  | "uploaded"
  | "missing"
  | "expired"
  | "not_required"
  | "waived"
  | "exempted"
  | "revoked";

type EmployeeRow = {
  id: string;
  employee_no: string | null;
  full_name: string | null;
  employee_type: string | null;
  employment_type: string | null;
  primary_department_id: string | null;
  primary_position_id: string | null;
  primary_location_id: string | null;
};

type RuleRow = {
  id: string;
  document_type_id: string;
  document_type_code: string | null;
  document_type_name: string | null;
  category_name: string | null;
  employee_type: string | null;
  employment_type: string | null;
  department_id: string | null;
  position_id: string | null;
  location_id: string | null;
  is_required: number;
  waiver_allowed: number;
  exemption_allowed: number;
  hard_required: number;
  waiver_requires_reason: number;
  waiver_requires_approval: number;
  rule_priority: number;
};

type DocumentTypeRow = {
  id: string;
  code: string;
  name: string;
  category_name: string | null;
  is_active: number;
  requires_expiry_date: number;
  allow_multiple_files: number;
  sort_order: number;
};

type ActiveDocumentRow = {
  id: string;
  document_type_id: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  updated_at: string | null;
  created_at: string | null;
};

type DecisionRow = {
  id: string;
  employee_id: string;
  document_type_id: string;
  required_rule_id: string | null;
  decision_status: DocumentRequirementDecisionStatus;
  decision_source: string;
  reason: string | null;
  notes: string | null;
  supporting_document_id: string | null;
  is_system_decision: number;
  approval_status: string;
  decided_by_user_id: string | null;
  decided_at: string;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  metadata_json: string | null;
};

export type DocumentRequirementDecisionListItem = {
  employee_id: string;
  document_type_id: string;
  document_type_code: string | null;
  document_type_name: string;
  category_name: string | null;
  required_rule_id: string | null;
  matched_rule: Record<string, unknown> | null;
  status: DocumentRequirementDecisionStatus;
  status_label: string;
  is_required: boolean;
  is_complete: boolean;
  activation_blocking: boolean;
  can_upload: boolean;
  can_mark_not_required: boolean;
  can_waive: boolean;
  can_exempt: boolean;
  can_revoke: boolean;
  waiver_allowed: boolean;
  exemption_allowed: boolean;
  hard_required: boolean;
  reason: string | null;
  next_action: string | null;
  decision: DecisionRow | null;
  document: ActiveDocumentRow | null;
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(expiryDate?: string | null) {
  return Boolean(expiryDate && expiryDate < todayIso());
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
}

function statusLabel(status: DocumentRequirementDecisionStatus) {
  const labels: Record<DocumentRequirementDecisionStatus, string> = {
    required: "Required",
    uploaded: "Uploaded",
    missing: "Missing",
    expired: "Expired",
    not_required: "Not required",
    waived: "Waived",
    exempted: "Exempted",
    revoked: "Revoked"
  };
  return labels[status] ?? "Required";
}

function reasonForStatus(status: DocumentRequirementDecisionStatus, rule: RuleRow | null, decision: DecisionRow | null, doc: ActiveDocumentRow | null) {
  if (decision?.reason && ["not_required", "waived", "exempted"].includes(decision.decision_status)) return decision.reason;
  if (status === "uploaded") return "An active document has been uploaded.";
  if (status === "expired") return "The active uploaded document is expired.";
  if (status === "missing" && rule) return "A matching required document rule applies to this employee.";
  if (status === "not_required" && !rule) return "No active required document rule matches this employee's type or assignment.";
  if (status === "not_required" && rule?.is_required !== 1) return "The matching document rule marks this document as optional.";
  if (doc) return "Document record is available.";
  return null;
}

function nextActionForStatus(status: DocumentRequirementDecisionStatus, hardRequired: boolean) {
  if (status === "missing") return hardRequired ? "Upload this hard-required document before activation." : "Upload the document, mark it not required, or add an approved waiver/exemption.";
  if (status === "expired") return "Replace or renew the expired document before activation.";
  if (status === "revoked") return "Review the requirement and upload, waive, or mark as not required again if appropriate.";
  return null;
}

function ruleMatches(rule: RuleRow, employee: EmployeeRow) {
  return (!rule.employee_type || rule.employee_type === employee.employee_type)
    && (!rule.employment_type || rule.employment_type === employee.employment_type)
    && (!rule.department_id || rule.department_id === employee.primary_department_id)
    && (!rule.position_id || rule.position_id === employee.primary_position_id)
    && (!rule.location_id || rule.location_id === employee.primary_location_id);
}

async function getEmployee(db: D1Database, employeeId: string) {
  return db.prepare(`
    SELECT id, employee_no, full_name, employee_type, employment_type,
           primary_department_id, primary_position_id, primary_location_id
      FROM employees
     WHERE id = ?
     LIMIT 1
  `).bind(employeeId).first<EmployeeRow>();
}

async function loadRelevantDocumentTypes(db: D1Database, employeeId: string) {
  const types = await db.prepare(`
    SELECT DISTINCT dt.id, dt.code, dt.name, dc.name AS category_name, dt.is_active,
           dt.requires_expiry_date, dt.allow_multiple_files, dt.sort_order
      FROM document_types dt
      LEFT JOIN document_categories dc ON dc.id = dt.category_id
      LEFT JOIN document_required_rules rr ON rr.document_type_id = dt.id AND rr.is_active = 1
      LEFT JOIN employee_documents ed ON ed.document_type_id = dt.id AND ed.employee_id = ? AND ed.status = 'ACTIVE'
      LEFT JOIN employee_document_requirement_decisions d ON d.document_type_id = dt.id AND d.employee_id = ?
     WHERE dt.is_active = 1
       AND (rr.id IS NOT NULL OR ed.id IS NOT NULL OR d.id IS NOT NULL)
     ORDER BY dt.sort_order, dt.name
     LIMIT 500
  `).bind(employeeId, employeeId).all<DocumentTypeRow>();
  return types.results;
}

async function loadRules(db: D1Database, typeIds: string[]) {
  if (!typeIds.length) return [];
  const placeholders = typeIds.map(() => "?").join(", ");
  const rows = await db.prepare(`
    SELECT rr.id, rr.document_type_id, rr.employee_type, rr.employment_type, rr.department_id,
           rr.position_id, rr.location_id, rr.is_required, rr.waiver_allowed, rr.exemption_allowed,
           rr.hard_required, rr.waiver_requires_reason, rr.waiver_requires_approval, rr.rule_priority,
           dt.code AS document_type_code, dt.name AS document_type_name, dc.name AS category_name
      FROM document_required_rules rr
      INNER JOIN document_types dt ON dt.id = rr.document_type_id
      LEFT JOIN document_categories dc ON dc.id = dt.category_id
     WHERE rr.is_active = 1
       AND dt.is_active = 1
       AND rr.document_type_id IN (${placeholders})
     ORDER BY rr.document_type_id, rr.rule_priority, dt.name
     LIMIT 1000
  `).bind(...typeIds).all<RuleRow>();
  return rows.results;
}

async function loadActiveDocuments(db: D1Database, employeeId: string, typeIds: string[]) {
  if (!typeIds.length) return [];
  const placeholders = typeIds.map(() => "?").join(", ");
  const rows = await db.prepare(`
    SELECT id, document_type_id, document_number, issue_date, expiry_date, status, updated_at, created_at
      FROM employee_documents
     WHERE employee_id = ?
       AND status = 'ACTIVE'
       AND document_type_id IN (${placeholders})
     ORDER BY document_type_id, updated_at DESC, created_at DESC
     LIMIT 1000
  `).bind(employeeId, ...typeIds).all<ActiveDocumentRow>();
  return rows.results;
}

async function loadLatestDecisions(db: D1Database, employeeId: string, typeIds: string[]) {
  if (!typeIds.length) return new Map<string, DecisionRow>();
  const placeholders = typeIds.map(() => "?").join(", ");
  const rows = await db.prepare(`
    SELECT id, employee_id, document_type_id, required_rule_id, decision_status, decision_source,
           reason, notes, supporting_document_id, is_system_decision, approval_status,
           decided_by_user_id, decided_at, revoked_by_user_id, revoked_at, revoke_reason,
           metadata_json
      FROM employee_document_requirement_decisions
     WHERE employee_id = ?
       AND document_type_id IN (${placeholders})
     ORDER BY document_type_id, decided_at DESC, updated_at DESC
     LIMIT 1000
  `).bind(employeeId, ...typeIds).all<DecisionRow>();
  const latest = new Map<string, DecisionRow>();
  for (const row of rows.results) {
    if (!latest.has(row.document_type_id)) latest.set(row.document_type_id, row);
  }
  return latest;
}

function chooseDocument(rows: ActiveDocumentRow[]) {
  return rows[0] ?? null;
}

function chooseMatchingRule(rules: RuleRow[], employee: EmployeeRow) {
  return rules.find((rule) => ruleMatches(rule, employee)) ?? null;
}

function itemFor(type: DocumentTypeRow, employee: EmployeeRow, allRules: RuleRow[], activeDocs: ActiveDocumentRow[], latestDecision: DecisionRow | null): DocumentRequirementDecisionListItem {
  const matchingRule = chooseMatchingRule(allRules, employee);
  const document = chooseDocument(activeDocs);
  const activeManualDecision = latestDecision && !["revoked", "missing", "uploaded", "expired"].includes(latestDecision.decision_status) && latestDecision.approval_status !== "REJECTED"
    ? latestDecision
    : null;
  const hardRequired = bool(matchingRule?.hard_required);
  let status: DocumentRequirementDecisionStatus;
  let isRequired = Boolean(matchingRule?.is_required === 1);

  if (document && isExpired(document.expiry_date)) {
    status = "expired";
  } else if (document) {
    status = "uploaded";
  } else if (activeManualDecision && ["not_required", "waived", "exempted"].includes(activeManualDecision.decision_status)) {
    status = activeManualDecision.decision_status;
    isRequired = false;
  } else if (matchingRule?.is_required === 1) {
    status = "missing";
  } else if (matchingRule && matchingRule.is_required !== 1) {
    status = "not_required";
    isRequired = false;
  } else if (allRules.length > 0) {
    status = "not_required";
    isRequired = false;
  } else {
    status = "required";
    isRequired = false;
  }

  const isComplete = ["uploaded", "not_required", "waived", "exempted"].includes(status);
  const activationBlocking = isRequired && !isComplete;
  const canDecision = !document && !hardRequired;
  const matchedRule = matchingRule ? {
    id: matchingRule.id,
    employee_type: matchingRule.employee_type,
    employment_type: matchingRule.employment_type,
    department_id: matchingRule.department_id,
    position_id: matchingRule.position_id,
    location_id: matchingRule.location_id,
    waiver_allowed: bool(matchingRule.waiver_allowed),
    exemption_allowed: bool(matchingRule.exemption_allowed),
    hard_required: hardRequired,
    waiver_requires_reason: bool(matchingRule.waiver_requires_reason),
    waiver_requires_approval: bool(matchingRule.waiver_requires_approval)
  } : null;

  return {
    employee_id: employee.id,
    document_type_id: type.id,
    document_type_code: type.code,
    document_type_name: type.name,
    category_name: type.category_name,
    required_rule_id: matchingRule?.id ?? null,
    matched_rule: matchedRule,
    status,
    status_label: statusLabel(status),
    is_required: isRequired,
    is_complete: isComplete,
    activation_blocking: activationBlocking,
    can_upload: !document,
    can_mark_not_required: canDecision && status === "missing",
    can_waive: canDecision && status === "missing" && bool(matchingRule?.waiver_allowed),
    can_exempt: canDecision && status === "missing" && bool(matchingRule?.exemption_allowed),
    can_revoke: Boolean(activeManualDecision && ["not_required", "waived", "exempted"].includes(activeManualDecision.decision_status)),
    waiver_allowed: bool(matchingRule?.waiver_allowed),
    exemption_allowed: bool(matchingRule?.exemption_allowed),
    hard_required: hardRequired,
    reason: reasonForStatus(status, matchingRule, activeManualDecision ?? latestDecision, document),
    next_action: nextActionForStatus(status, hardRequired),
    decision: activeManualDecision ?? latestDecision ?? null,
    document
  };
}

export async function buildDocumentRequirementDecisionList(db: D1Database, employeeId: string) {
  const employee = await getEmployee(db, employeeId);
  if (!employee) {
    return {
      employee: null,
      decisions: [] as DocumentRequirementDecisionListItem[],
      summary: { total: 0, complete: 0, blocking: 0, missing: 0, expired: 0, waived: 0, not_required: 0 },
      activation_blockers: [] as Array<Record<string, unknown>>
    };
  }
  const types = await loadRelevantDocumentTypes(db, employeeId);
  const typeIds = types.map((type) => type.id);
  const [rules, docs, decisions] = await Promise.all([
    loadRules(db, typeIds),
    loadActiveDocuments(db, employeeId, typeIds),
    loadLatestDecisions(db, employeeId, typeIds)
  ]);
  const rulesByType = new Map<string, RuleRow[]>();
  for (const rule of rules) {
    const bucket = rulesByType.get(rule.document_type_id) ?? [];
    bucket.push(rule);
    rulesByType.set(rule.document_type_id, bucket);
  }
  const docsByType = new Map<string, ActiveDocumentRow[]>();
  for (const doc of docs) {
    const bucket = docsByType.get(doc.document_type_id) ?? [];
    bucket.push(doc);
    docsByType.set(doc.document_type_id, bucket);
  }
  const items = types
    .map((type) => itemFor(type, employee, rulesByType.get(type.id) ?? [], docsByType.get(type.id) ?? [], decisions.get(type.id) ?? null))
    .filter((item) => item.status !== "required" || item.document || item.decision || item.required_rule_id)
    .sort((a, b) => a.document_type_name.localeCompare(b.document_type_name));
  const blockers = items
    .filter((item) => item.activation_blocking)
    .map((item) => ({
      type: item.status === "expired" ? "DOCUMENT_EXPIRED" : "DOCUMENT_REQUIRED",
      document_type_id: item.document_type_id,
      document_type_name: item.document_type_name,
      message: item.status === "expired" ? `${item.document_type_name} is expired.` : `${item.document_type_name} is required for this employee.`,
      next_action: item.next_action ?? "Upload this document or record an approved decision."
    }));
  return {
    employee,
    decisions: items,
    summary: {
      total: items.length,
      complete: items.filter((item) => item.is_complete).length,
      blocking: blockers.length,
      missing: items.filter((item) => item.status === "missing").length,
      expired: items.filter((item) => item.status === "expired").length,
      waived: items.filter((item) => item.status === "waived" || item.status === "exempted").length,
      not_required: items.filter((item) => item.status === "not_required").length
    },
    activation_blockers: blockers
  };
}

async function insertDecision(db: D1Database, input: {
  employeeId: string;
  documentTypeId: string;
  requiredRuleId?: string | null;
  status: DocumentRequirementDecisionStatus;
  source: "system" | "manual" | "upload_sync" | "activation_verifier";
  reason?: string | null;
  notes?: string | null;
  supportingDocumentId?: string | null;
  actorUserId?: string | null;
  isSystem?: boolean;
  approvalStatus?: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  metadata?: unknown;
}) {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.prepare(`
    INSERT INTO employee_document_requirement_decisions
      (id, employee_id, document_type_id, required_rule_id, decision_status, decision_source,
       reason, notes, supporting_document_id, is_system_decision, approval_status,
       decided_by_user_id, decided_at, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.employeeId,
    input.documentTypeId,
    input.requiredRuleId ?? null,
    input.status,
    input.source,
    input.reason ?? null,
    input.notes ?? null,
    input.supportingDocumentId ?? null,
    input.isSystem ? 1 : 0,
    input.approvalStatus ?? (input.status === "not_required" ? "NOT_REQUIRED" : "APPROVED"),
    input.actorUserId ?? null,
    now,
    safeJson(input.metadata ?? null),
    now,
    now
  ).run();
  return id;
}

export async function getDocumentDecisionStatus(db: D1Database, employeeId: string, documentTypeId: string) {
  const list = await buildDocumentRequirementDecisionList(db, employeeId);
  return list.decisions.find((item) => item.document_type_id === documentTypeId) ?? null;
}

export async function decideDocumentNotRequired(db: D1Database, input: { employeeId: string; documentTypeId: string; reason?: string | null; actorUserId?: string | null; notes?: string | null }) {
  const current = await getDocumentDecisionStatus(db, input.employeeId, input.documentTypeId);
  if (!current) throw new Error("DOCUMENT_REQUIREMENT_NOT_FOUND");
  if (current.hard_required) throw new Error("DOCUMENT_REQUIREMENT_HARD_REQUIRED");
  if (current.document) throw new Error("DOCUMENT_REQUIREMENT_ALREADY_UPLOADED");
  const reason = text(input.reason);
  if (!reason) throw new Error("DOCUMENT_DECISION_REASON_REQUIRED");
  await insertDecision(db, {
    employeeId: input.employeeId,
    documentTypeId: input.documentTypeId,
    requiredRuleId: current.required_rule_id,
    status: "not_required",
    source: "manual",
    reason,
    notes: input.notes ?? null,
    actorUserId: input.actorUserId ?? null,
    approvalStatus: "NOT_REQUIRED",
    metadata: { previous_status: current.status }
  });
  return buildDocumentRequirementDecisionList(db, input.employeeId);
}

export async function waiveDocumentRequirement(db: D1Database, input: { employeeId: string; documentTypeId: string; decision?: "waived" | "exempted"; reason?: string | null; actorUserId?: string | null; notes?: string | null }) {
  const current = await getDocumentDecisionStatus(db, input.employeeId, input.documentTypeId);
  if (!current) throw new Error("DOCUMENT_REQUIREMENT_NOT_FOUND");
  if (current.hard_required) throw new Error("DOCUMENT_REQUIREMENT_HARD_REQUIRED");
  if (current.document) throw new Error("DOCUMENT_REQUIREMENT_ALREADY_UPLOADED");
  const decision = input.decision === "exempted" ? "exempted" : "waived";
  if (decision === "waived" && !current.waiver_allowed) throw new Error("DOCUMENT_WAIVER_NOT_ALLOWED");
  if (decision === "exempted" && !current.exemption_allowed) throw new Error("DOCUMENT_EXEMPTION_NOT_ALLOWED");
  const reason = text(input.reason);
  if (!reason) throw new Error("DOCUMENT_DECISION_REASON_REQUIRED");
  await insertDecision(db, {
    employeeId: input.employeeId,
    documentTypeId: input.documentTypeId,
    requiredRuleId: current.required_rule_id,
    status: decision,
    source: "manual",
    reason,
    notes: input.notes ?? null,
    actorUserId: input.actorUserId ?? null,
    approvalStatus: "APPROVED",
    metadata: { previous_status: current.status }
  });
  return buildDocumentRequirementDecisionList(db, input.employeeId);
}

export async function revokeDocumentDecision(db: D1Database, input: { employeeId: string; documentTypeId: string; reason?: string | null; actorUserId?: string | null }) {
  const current = await getDocumentDecisionStatus(db, input.employeeId, input.documentTypeId);
  if (!current?.decision || !["not_required", "waived", "exempted"].includes(current.decision.decision_status)) {
    throw new Error("DOCUMENT_DECISION_NOT_ACTIVE");
  }
  const reason = text(input.reason);
  if (!reason) throw new Error("DOCUMENT_DECISION_REASON_REQUIRED");
  const now = nowIso();
  await db.prepare(`
    UPDATE employee_document_requirement_decisions
       SET decision_status = 'revoked',
           approval_status = 'REVOKED',
           revoked_by_user_id = ?,
           revoked_at = ?,
           revoke_reason = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(input.actorUserId ?? null, now, reason, now, current.decision.id).run();
  await insertDecision(db, {
    employeeId: input.employeeId,
    documentTypeId: input.documentTypeId,
    requiredRuleId: current.required_rule_id,
    status: "missing",
    source: "manual",
    reason: "Requirement decision was revoked.",
    notes: reason,
    actorUserId: input.actorUserId ?? null,
    approvalStatus: "APPROVED",
    metadata: { revoked_decision_id: current.decision.id, previous_status: current.status }
  });
  return buildDocumentRequirementDecisionList(db, input.employeeId);
}

export async function syncDocumentDecisionAfterUpload(db: D1Database, input: { employeeId: string; documentTypeId: string; actorUserId?: string | null; documentId?: string | null; source?: "upload_sync" | "activation_verifier" }) {
  const current = await getDocumentDecisionStatus(db, input.employeeId, input.documentTypeId);
  if (!current) return buildDocumentRequirementDecisionList(db, input.employeeId);
  const syncStatus: DocumentRequirementDecisionStatus = current.document
    ? (current.status === "expired" ? "expired" : "uploaded")
    : (current.activation_blocking ? "missing" : "not_required");
  await insertDecision(db, {
    employeeId: input.employeeId,
    documentTypeId: input.documentTypeId,
    requiredRuleId: current.required_rule_id,
    status: syncStatus,
    source: input.source ?? "upload_sync",
    reason: syncStatus === "uploaded" ? "Document upload satisfied this requirement." : syncStatus === "expired" ? "Uploaded document is expired." : "Document requirement state synced after document change.",
    supportingDocumentId: input.documentId ?? current.document?.id ?? null,
    actorUserId: input.actorUserId ?? null,
    isSystem: true,
    metadata: { previous_status: current.status }
  });
  return buildDocumentRequirementDecisionList(db, input.employeeId);
}

export async function verifyDocumentDecisionForActivation(db: D1Database, employeeId: string) {
  const list = await buildDocumentRequirementDecisionList(db, employeeId);
  const blockers = list.activation_blockers;
  return {
    ok: blockers.length === 0,
    status: blockers.length ? "blocked" : "verified",
    total: list.summary.total,
    complete: list.summary.complete,
    blockers,
    decisions: list.decisions
  };
}

export function sanitizeDocumentDecisionError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const mapping: Record<string, { code: string; message: string; next_action: string }> = {
    DOCUMENT_REQUIREMENT_NOT_FOUND: {
      code: "DOCUMENT_REQUIREMENT_NOT_FOUND",
      message: "Document requirement was not found for this employee.",
      next_action: "Refresh the Employee 360 Documents tab and try again."
    },
    DOCUMENT_REQUIREMENT_HARD_REQUIRED: {
      code: "DOCUMENT_REQUIREMENT_HARD_REQUIRED",
      message: "This document is hard-required and cannot be marked not required or waived.",
      next_action: "Upload the required document before activation."
    },
    DOCUMENT_REQUIREMENT_ALREADY_UPLOADED: {
      code: "DOCUMENT_REQUIREMENT_ALREADY_UPLOADED",
      message: "This document requirement is already satisfied by an active upload.",
      next_action: "Refresh the document list before changing the requirement decision."
    },
    DOCUMENT_DECISION_REASON_REQUIRED: {
      code: "DOCUMENT_DECISION_REASON_REQUIRED",
      message: "A reason is required for this document requirement decision.",
      next_action: "Enter a short reason and submit again."
    },
    DOCUMENT_WAIVER_NOT_ALLOWED: {
      code: "DOCUMENT_WAIVER_NOT_ALLOWED",
      message: "This document rule does not allow waivers.",
      next_action: "Upload the document or review the required document rule configuration."
    },
    DOCUMENT_EXEMPTION_NOT_ALLOWED: {
      code: "DOCUMENT_EXEMPTION_NOT_ALLOWED",
      message: "This document rule does not allow exemptions.",
      next_action: "Upload the document or review the required document rule configuration."
    },
    DOCUMENT_DECISION_NOT_ACTIVE: {
      code: "DOCUMENT_DECISION_NOT_ACTIVE",
      message: "There is no active not-required, waived, or exempted decision to revoke.",
      next_action: "Refresh the Employee 360 Documents tab and review the current status."
    }
  };
  const safe = mapping[raw] ?? {
    code: "DOCUMENT_DECISION_FAILED",
    message: "Document requirement decision could not be saved safely.",
    next_action: "Review the document requirement and try again."
  };
  return {
    ...safe,
    safe_log_message: raw
      .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
      .replace(/\bSELECT\b[\s\S]*/gi, "The document decision check could not be completed")
      .replace(/password|token|secret|document number|account number|bank account|payroll amount/gi, "sensitive value")
      .slice(0, 220)
  };
}
