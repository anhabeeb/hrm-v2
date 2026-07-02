import type { Env, AuthUser } from "../types";
import { nowIso } from "./http";

export type ReportArtifactRow = {
  id: string;
  job_id: string | null;
  report_key: string;
  artifact_type: "CSV" | "JSON" | "EXCEL" | "PDF";
  status: "PENDING" | "READY" | "FAILED" | "EXPIRED";
  file_name: string | null;
  mime_type: string | null;
  storage_key: string | null;
  row_count: number;
  expires_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

const ARTIFACT_TTL_DAYS = 7;
const SENSITIVE_METADATA_KEY = /(password|token|secret|credential|account|iban|swift|document_number|raw|file_contents|salary|amount|bank)/i;

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function sanitizeArtifactMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeArtifactMetadata(item, depth + 1));
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return null;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_METADATA_KEY.test(key) ? "[redacted]" : sanitizeArtifactMetadata(nested, depth + 1);
  }
  return output;
}

function mimeForArtifact(type: string) {
  if (type === "JSON") return "application/json; charset=utf-8";
  if (type === "EXCEL") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (type === "PDF") return "application/pdf";
  return "text/csv; charset=utf-8";
}

export function artifactStorageKey(input: { reportKey: string; artifactId: string; fileName: string }) {
  const safeKey = input.reportKey.replace(/[^a-z0-9/_-]+/gi, "-").replace(/\/+/g, "/").toLowerCase();
  const safeFile = input.fileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  return `report-artifacts/${safeKey}/${input.artifactId}/${safeFile}`;
}

export async function createReportArtifact(db: Env["DB"], input: {
  jobId?: string | null;
  reportKey: string;
  artifactType: "CSV" | "JSON" | "EXCEL" | "PDF";
  fileName?: string | null;
  rowCount?: number;
  createdByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const id = `report_artifact_${crypto.randomUUID()}`;
  const now = nowIso();
  await db.prepare(
    `INSERT INTO report_export_artifacts
      (id, job_id, report_key, artifact_type, status, file_name, mime_type, storage_key, row_count, expires_at, created_by_user_id, created_at, updated_at, metadata_json)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.jobId ?? null,
    input.reportKey,
    input.artifactType,
    input.fileName ?? null,
    mimeForArtifact(input.artifactType),
    Math.max(0, Math.trunc(Number(input.rowCount ?? 0))),
    addDaysIso(ARTIFACT_TTL_DAYS),
    input.createdByUserId ?? null,
    now,
    now,
    input.metadata ? JSON.stringify(sanitizeArtifactMetadata(input.metadata)) : null
  ).run();
  return getReportArtifact(db, id);
}

export async function writeReportArtifactObject(env: Env, artifact: ReportArtifactRow, body: string | ArrayBuffer | Uint8Array) {
  const fileName = artifact.file_name ?? `${artifact.id}.${artifact.artifact_type.toLowerCase()}`;
  const storageKey = artifactStorageKey({ reportKey: artifact.report_key, artifactId: artifact.id, fileName });
  await env.DOCUMENTS_BUCKET.put(storageKey, body, {
    httpMetadata: { contentType: artifact.mime_type ?? mimeForArtifact(artifact.artifact_type) },
    customMetadata: { artifact_id: artifact.id, report_key: artifact.report_key }
  });
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE report_export_artifacts
     SET status = 'READY', storage_key = ?, updated_at = ?
     WHERE id = ?`
  ).bind(storageKey, now, artifact.id).run();
  return getReportArtifact(env.DB, artifact.id);
}

export async function markReportArtifactFailed(db: Env["DB"], artifactId: string, metadata?: Record<string, unknown> | null) {
  await db.prepare(
    `UPDATE report_export_artifacts
     SET status = 'FAILED', metadata_json = COALESCE(?, metadata_json), updated_at = ?
     WHERE id = ?`
  ).bind(metadata ? JSON.stringify(sanitizeArtifactMetadata(metadata)) : null, nowIso(), artifactId).run();
  return getReportArtifact(db, artifactId);
}

export async function expireReportArtifact(db: Env["DB"], artifactId: string) {
  await db.prepare("UPDATE report_export_artifacts SET status = 'EXPIRED', updated_at = ? WHERE id = ?").bind(nowIso(), artifactId).run();
  return getReportArtifact(db, artifactId);
}

export async function getReportArtifact(db: Env["DB"], artifactId: string) {
  return db.prepare("SELECT * FROM report_export_artifacts WHERE id = ?").bind(artifactId).first<ReportArtifactRow>();
}

export async function getReportArtifactForJob(db: Env["DB"], jobId: string) {
  return db.prepare("SELECT * FROM report_export_artifacts WHERE job_id = ? ORDER BY created_at DESC LIMIT 1").bind(jobId).first<ReportArtifactRow>();
}

export function sanitizeReportArtifactForUser(artifact: ReportArtifactRow, user?: AuthUser | null) {
  const canSeeOwner = Boolean(user?.is_owner || user?.id === artifact.created_by_user_id || user?.permissions.includes("reports.manage") || user?.permissions.includes("reports.export.history.view"));
  return {
    id: artifact.id,
    job_id: artifact.job_id,
    report_key: artifact.report_key,
    artifact_type: artifact.artifact_type,
    status: artifact.status,
    file_name: artifact.file_name,
    mime_type: artifact.mime_type,
    row_count: artifact.row_count,
    expires_at: artifact.expires_at,
    created_by_user_id: canSeeOwner ? artifact.created_by_user_id : undefined,
    created_at: artifact.created_at,
    updated_at: artifact.updated_at,
    download_url: artifact.status === "READY" ? `/api/v1/reports/artifacts/${artifact.id}/download` : null
  };
}

export async function readArtifactObject(env: Env, artifact: ReportArtifactRow) {
  if (!artifact.storage_key) return null;
  return env.DOCUMENTS_BUCKET.get(artifact.storage_key);
}

export function reportArtifactLog(event: string, metadata: Record<string, unknown>) {
  const safeMetadata = sanitizeArtifactMetadata(metadata) as Record<string, unknown>;
  console.log(JSON.stringify({ level: "info", event, ...safeMetadata }));
}
