import { useCallback, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import { completeOnboardingDocumentUploads, prepareOnboardingDocumentUploads, type CompleteDocumentUploadsResult, type PreparedDocumentUpload, type PreparedDocumentUploadRow } from "../lib/documentUploadApi";
import { uploadWithProgress } from "../lib/uploadProgress";

export type DocumentUploadRowStatus = "Pending" | "Preparing" | "Uploading" | "Processing" | "Uploaded" | "Failed" | "Retry";

export type DocumentUploadBatchRowInput = {
  id: string;
  document_type_id: string;
  file: File | null;
  issue_date?: string;
  expiry_date?: string;
  document_number?: string;
  notes?: string;
};

export type DocumentUploadRowState = {
  status: DocumentUploadRowStatus;
  progress: number;
  message?: string;
  uploadId?: string;
};

type UploadBatchInput = {
  rows: DocumentUploadBatchRowInput[];
  fallbackForm: FormData;
  fallbackBatchUpload: (form: FormData) => Promise<unknown>;
};

type UseDocumentUploadBatchOptions = {
  token: string | null | undefined;
  caseId: string;
  onCompleted?: (result: CompleteDocumentUploadsResult) => void;
};

function initialRowState(status: DocumentUploadRowStatus = "Pending"): DocumentUploadRowState {
  return { status, progress: 0 };
}

function toPrepareRow(row: DocumentUploadBatchRowInput): PreparedDocumentUploadRow {
  return {
    client_row_id: row.id,
    document_type_id: row.document_type_id,
    file_name: row.file?.name ?? "",
    mime_type: row.file?.type || "application/octet-stream",
    file_size: row.file?.size ?? 0,
    issue_date: row.issue_date || null,
    expiry_date: row.expiry_date || null,
    document_number: row.document_number || null,
    notes: row.notes || null
  };
}

function uploadForRow(uploads: PreparedDocumentUpload[], rowId: string) {
  return uploads.find((upload) => upload.client_row_id === rowId);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useDocumentUploadBatch(options: UseDocumentUploadBatchOptions) {
  const [rowStates, setRowStates] = useState<Record<string, DocumentUploadRowState>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [readinessUpdating, setReadinessUpdating] = useState(false);

  const setRowsStatus = useCallback((rows: DocumentUploadBatchRowInput[], status: DocumentUploadRowStatus, message?: string) => {
    setRowStates((current) => {
      const next = { ...current };
      for (const row of rows) next[row.id] = { ...(next[row.id] ?? initialRowState()), status, message, progress: status === "Uploaded" ? 100 : next[row.id]?.progress ?? 0 };
      return next;
    });
  }, []);

  const setRowStatus = useCallback((rowId: string, state: Partial<DocumentUploadRowState>) => {
    setRowStates((current) => ({
      ...current,
      [rowId]: { ...(current[rowId] ?? initialRowState()), ...state }
    }));
  }, []);

  const uploadRows = useCallback(async ({ rows, fallbackForm, fallbackBatchUpload }: UploadBatchInput) => {
    if (!options.token) throw new Error("Authentication is required before uploading documents.");
    const activeRows = rows.filter((row) => row.file);
    setIsUploading(true);
    setReadinessUpdating(false);
    setRowsStatus(activeRows, "Preparing");
    try {
      const prepared = await prepareOnboardingDocumentUploads(options.token, options.caseId, activeRows.map(toPrepareRow));
      const uploadedIds: string[] = [];
      await Promise.all(activeRows.map(async (row) => {
        const upload = uploadForRow(prepared.uploads, row.id);
        if (!upload || !row.file) {
          setRowStatus(row.id, { status: "Failed", message: "Upload preparation did not return a target for this row." });
          return;
        }
        setRowStatus(row.id, { status: "Uploading", progress: 1, uploadId: upload.upload_id });
        try {
          if (upload.upload_mode === "direct_r2") {
            throw new Error("Direct R2 browser upload is not configured for this environment. Using Worker fallback is required.");
          }
          await uploadWithProgress({
            url: upload.upload_url,
            file: row.file,
            token: options.token,
            headers: upload.required_headers,
            onProgress: ({ percent }) => setRowStatus(row.id, { status: "Uploading", progress: percent, uploadId: upload.upload_id })
          });
          uploadedIds.push(upload.upload_id);
          setRowStatus(row.id, { status: "Processing", progress: 100, uploadId: upload.upload_id });
        } catch (error) {
          setRowStatus(row.id, { status: "Failed", message: errorMessage(error, "This file failed to upload."), uploadId: upload.upload_id });
        }
      }));
      if (!uploadedIds.length) throw new Error("No document files uploaded successfully. Retry the failed rows.");
      const completed = await completeOnboardingDocumentUploads(options.token, options.caseId, uploadedIds);
      const failedRows = new Set<string>();
      for (const result of completed.results) {
        const rowId = String(result.client_row_id ?? "");
        if (!rowId) continue;
        if (String(result.status) === "UPLOADED") {
          setRowStatus(rowId, { status: "Uploaded", progress: 100, message: "Uploaded" });
        } else {
          failedRows.add(rowId);
          setRowStatus(rowId, { status: "Failed", message: String(result.message ?? "Document could not be committed."), progress: 100 });
        }
      }
      setReadinessUpdating(Boolean(completed.readiness_updating || completed.recalculation_status === "queued"));
      options.onCompleted?.(completed);
      if (failedRows.size) throw new Error("Some document rows failed. Retry only the failed rows.");
      return completed;
    } catch (error) {
      if (error instanceof ApiError && error.code === "DOCUMENT_UPLOAD_PREPARE_VALIDATION_FAILED") throw error;
      setRowsStatus(activeRows, "Processing", "Using compatibility batch upload fallback.");
      try {
        const fallback = await fallbackBatchUpload(fallbackForm);
        setRowsStatus(activeRows, "Uploaded");
        setReadinessUpdating(true);
        return fallback;
      } catch (fallbackError) {
        setRowsStatus(activeRows, "Failed", errorMessage(fallbackError, "Document batch upload failed."));
        throw fallbackError;
      }
    } finally {
      setIsUploading(false);
    }
  }, [options, setRowStatus, setRowsStatus]);

  const isRowActive = useCallback((rowId: string) => {
    const status = rowStates[rowId]?.status;
    return status === "Preparing" || status === "Uploading" || status === "Processing";
  }, [rowStates]);

  const failedRowIds = useMemo(() => Object.entries(rowStates).filter(([, state]) => state.status === "Failed").map(([rowId]) => rowId), [rowStates]);

  return {
    rowStates,
    isUploading,
    readinessUpdating,
    failedRowIds,
    uploadRows,
    isRowActive,
    rowState: (rowId: string) => rowStates[rowId] ?? initialRowState(),
    clearReadinessUpdating: () => setReadinessUpdating(false)
  };
}
