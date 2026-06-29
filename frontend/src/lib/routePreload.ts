type RoutePreloader = () => Promise<unknown>;

const routePreloadRegistry = new Map<string, RoutePreloader>();
const routePreloadInflight = new Map<string, Promise<unknown>>();

export function registerRoutePreloader(key: string, preload: RoutePreloader) {
  routePreloadRegistry.set(key, preload);
}

export function preloadRouteChunk(key: string) {
  const preload = routePreloadRegistry.get(key);
  if (!preload) return Promise.resolve();
  const existing = routePreloadInflight.get(key);
  if (existing) return existing;
  const promise = preload().finally(() => routePreloadInflight.delete(key));
  routePreloadInflight.set(key, promise);
  return promise;
}

export function preloadLikelyRoute(key: string, moduleVisibility?: Record<string, boolean>, moduleKey?: string | string[]) {
  if (moduleKey) {
    const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
    if (!keys.some((key) => moduleVisibility?.[key] !== false)) return;
  }
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => void preloadRouteChunk(key), { timeout: 1200 });
    return;
  }
  void preloadRouteChunk(key);
}
