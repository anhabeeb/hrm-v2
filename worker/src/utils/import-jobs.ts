import type { Env } from "../types";
import {
  markJobFailed,
  markJobRunning,
  markJobSucceeded,
  updateJobProgress,
  type BackgroundJobRow
} from "./background-jobs";
import { safeEmitAppEvent } from "./app-events";

export type ImportJobResult = {
  batch?: Record<string, unknown> | null;
  processedRows?: number;
  errorRows?: number;
};

export async function runImportValidationJob(env: Env, job: BackgroundJobRow, task: () => Promise<ImportJobResult>) {
  return runTrackedImportJob(env, job, "Validating import batch.", "Import validation completed.", "IMPORT_VALIDATION_FAILED", task);
}

export async function runImportApplyJob(env: Env, job: BackgroundJobRow, task: () => Promise<ImportJobResult>) {
  return runTrackedImportJob(env, job, "Applying import batch.", "Import apply completed.", "IMPORT_APPLY_FAILED", task);
}

async function runTrackedImportJob(env: Env, job: BackgroundJobRow, runningMessage: string, successMessage: string, failureCode: string, task: () => Promise<ImportJobResult>) {
  const startedAt = Date.now();
  try {
    await markJobRunning(env.DB, job.id, runningMessage);
    await updateJobProgress(env.DB, job.id, { current: 1, total: 3, message: runningMessage });
    const result = await task();
    await updateJobProgress(env.DB, job.id, { current: 3, total: 3, message: successMessage });
    await markJobSucceeded(env.DB, job.id, successMessage, {
      processed_rows: result.processedRows ?? result.batch?.row_count ?? null,
      error_rows: result.errorRows ?? result.batch?.error_count ?? null,
      duration_ms: Date.now() - startedAt
    });
    const completedEvent = failureCode === "IMPORT_APPLY_FAILED" ? "import.apply.completed" : "import.validation.completed";
    await safeEmitAppEvent(env.DB, {
      eventType: completedEvent,
      moduleKey: "data_import",
      entityType: "import_batch",
      entityId: job.entity_id ?? (typeof result.batch?.id === "string" ? result.batch.id : job.id),
      visibility: job.requested_by_user_id ? "USER" : "COMPANY",
      userScopeId: job.requested_by_user_id,
      createdByUserId: job.requested_by_user_id,
      payload: {
        job_id: job.id,
        batch_id: job.entity_id ?? (typeof result.batch?.id === "string" ? result.batch.id : null),
        status: "COMPLETED",
        processed_rows: result.processedRows ?? result.batch?.row_count ?? null,
        error_rows: result.errorRows ?? result.batch?.error_count ?? null,
        safe_label: successMessage
      },
      queryKeys: ["data_import", "background-jobs"],
      dedupeKey: `${completedEvent}:${job.entity_id ?? job.id}`
    });
    importJobLog("import_job.succeeded", { job_id: job.id, duration_ms: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import job failed.";
    await markJobFailed(env.DB, job.id, failureCode, message, { duration_ms: Date.now() - startedAt });
    importJobLog("import_job.failed", { job_id: job.id, duration_ms: Date.now() - startedAt, message });
  }
}

export function importJobLog(event: string, metadata: Record<string, unknown>) {
  const safe = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/(raw|row|payload|salary|amount|account|document|token|secret|password)/i.test(key)));
  console.log(JSON.stringify({ level: "info", event, ...safe }));
}
