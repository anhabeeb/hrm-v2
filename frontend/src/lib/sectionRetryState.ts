import { ApiError } from "./api";

export function isQuietOptionalSectionError(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 403 || error.status === 503 || ["REQUEST_ABORTED", "MODULE_DISABLED", "SUBMODULE_DISABLED"].includes(error.code);
}

export function createSectionRetryState(input: { title: string; error?: unknown; refreshing?: boolean }) {
  const error = input.error instanceof ApiError ? input.error : null;
  return {
    title: input.title,
    code: error?.code ?? null,
    message: error?.message ?? (input.refreshing ? `${input.title} is refreshing.` : `${input.title} is temporarily unavailable.`),
    quiet: isQuietOptionalSectionError(error),
    refreshing: Boolean(input.refreshing)
  };
}
