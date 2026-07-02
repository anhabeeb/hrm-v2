export function isTruthyDebugValue(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

export function isPerformanceDebugEnabled() {
  const viteFlag = isTruthyDebugValue(import.meta.env.VITE_PERFORMANCE_DEBUG);
  const localFlag = typeof window !== "undefined" && isTruthyDebugValue(window.localStorage.getItem("hrm_v2_performance_debug"));
  return Boolean(viteFlag || localFlag);
}
