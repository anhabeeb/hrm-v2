import type { Env } from "../types";
import {
  markJobFailed,
  markJobRunning,
  markJobSucceeded,
  updateJobProgress,
  type BackgroundJobRow
} from "./background-jobs";
import { safeEmitAppEvent } from "./app-events";
import { markReportArtifactFailed, type ReportArtifactRow } from "./report-artifacts";

export type ReportJobResult = {
  artifact?: ReportArtifactRow | null;
  rowCount?: number;
  fileName?: string | null;
};

export async function runReportExportJob(env: Env, job: BackgroundJobRow, task: () => Promise<ReportJobResult>) {
  const startedAt = Date.now();
  let artifactId: string | null = null;
  try {
    await markJobRunning(env.DB, job.id, "Generating report export artifact.");
    await updateJobProgress(env.DB, job.id, { current: 1, total: 4, message: "Preparing report query." });
    const result = await task();
    artifactId = result.artifact?.id ?? null;
    await updateJobProgress(env.DB, job.id, { current: 4, total: 4, message: "Report export ready to download." });
    await markJobSucceeded(env.DB, job.id, "Report export generated.", {
      artifact_id: artifactId,
      row_count: result.rowCount ?? result.artifact?.row_count ?? 0,
      file_name: result.fileName ?? result.artifact?.file_name ?? null,
      duration_ms: Date.now() - startedAt
    });
    await safeEmitAppEvent(env.DB, {
      eventType: "report.artifact.ready",
      moduleKey: "reports",
      entityType: "report_artifact",
      entityId: artifactId,
      visibility: job.requested_by_user_id ? "USER" : "COMPANY",
      userScopeId: job.requested_by_user_id,
      createdByUserId: job.requested_by_user_id,
      payload: {
        job_id: job.id,
        artifact_id: artifactId,
        report_key: result.artifact?.report_key ?? job.entity_id ?? null,
        status: "READY",
        safe_label: "Report export ready"
      },
      queryKeys: ["reports", "report-artifacts", "background-jobs"],
      dedupeKey: `report.artifact.ready:${artifactId ?? job.id}`
    });
    reportJobLog("report_export_job.succeeded", { job_id: job.id, artifact_id: artifactId, duration_ms: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report export failed.";
    if (artifactId) await markReportArtifactFailed(env.DB, artifactId, { reason: "REPORT_EXPORT_FAILED" });
    await markJobFailed(env.DB, job.id, "REPORT_EXPORT_FAILED", message, { duration_ms: Date.now() - startedAt });
    reportJobLog("report_export_job.failed", { job_id: job.id, duration_ms: Date.now() - startedAt, message });
  }
}

export function reportJobLog(event: string, metadata: Record<string, unknown>) {
  const safe = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/(salary|amount|account|document|raw|token|secret|password)/i.test(key)));
  console.log(JSON.stringify({ level: "info", event, ...safe }));
}
