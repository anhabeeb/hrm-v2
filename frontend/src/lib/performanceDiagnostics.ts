const ENABLED_STORAGE_KEY = "hrm_v2_perf_diagnostics";
const SLOW_THRESHOLD_MS = 600;

function enabled() {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_STORAGE_KEY) === "1";
}

export function markPerformance(label: string) {
  if (!enabled() || typeof performance === "undefined") return;
  performance.mark(`hrm:${label}`);
}

export function measurePerformance(label: string, start: number) {
  if (!enabled() || typeof performance === "undefined") return;
  const duration = performance.now() - start;
  if (duration < SLOW_THRESHOLD_MS && !import.meta.env.DEV) return;
  // Labels only; never include request payloads, names, IDs, or user-entered values.
  console.debug(`[hrm-perf] ${label}: ${Math.round(duration)}ms`);
}

export async function measureAsync<T>(label: string, action: () => Promise<T>) {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await action();
  } finally {
    measurePerformance(label, start);
  }
}
