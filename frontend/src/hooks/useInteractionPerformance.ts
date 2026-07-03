import { useCallback } from "react";
import { useLocation } from "react-router-dom";

function recordInteraction(name: string, durationMs: number, routeKey: string) {
  void import("../lib/performanceMetrics")
    .then(({ recordInteractionMetric }) => recordInteractionMetric(name, durationMs, routeKey))
    .catch(() => undefined);
}

export function useInteractionPerformance() {
  const location = useLocation();

  return useCallback(
    <TArgs extends unknown[], TResult>(name: string, handler: (...args: TArgs) => TResult) => {
      return (...args: TArgs) => {
        const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        try {
          const result = handler(...args);
          if (result instanceof Promise) {
            return result.finally(() => {
              const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
              recordInteraction(name, finishedAt - startedAt, location.pathname);
            }) as TResult;
          }
          const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          recordInteraction(name, finishedAt - startedAt, location.pathname);
          return result;
        } catch (error) {
          const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          recordInteraction(`${name}:error`, finishedAt - startedAt, location.pathname);
          throw error;
        }
      };
    },
    [location.pathname]
  );
}
