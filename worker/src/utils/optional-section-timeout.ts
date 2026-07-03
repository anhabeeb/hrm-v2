export type OptionalSectionRunResult<T> =
  | { status: "ready"; value: T; durationMs: number }
  | { status: "timeout"; durationMs: number };

export async function runOptionalSectionWithTimeout<T>(input: {
  label: string;
  timeoutMs: number;
  run: () => Promise<T>;
  onLateFailure?: (error: unknown) => void;
}): Promise<OptionalSectionRunResult<T>> {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve()
    .then(input.run)
    .then((value) => ({ status: "ready" as const, value, durationMs: Date.now() - startedAt }));

  operation.catch((error) => {
    input.onLateFailure?.(error);
  });

  const timeout = new Promise<OptionalSectionRunResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: "timeout", durationMs: Date.now() - startedAt });
    }, input.timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
