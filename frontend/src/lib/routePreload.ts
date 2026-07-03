type RoutePreloader = () => Promise<unknown>;

const routePreloadRegistry = new Map<string, RoutePreloader>();
const routePreloadInflight = new Map<string, Promise<unknown>>();
const prefetchedRouteChunks = new Set<string>();

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

export function registerRoutePreloader(key: string, preload: RoutePreloader) {
  routePreloadRegistry.set(key, preload);
}

export function preloadRouteChunk(key: string) {
  if (prefetchedRouteChunks.has(key)) return Promise.resolve();
  const preload = routePreloadRegistry.get(key);
  if (!preload) return Promise.resolve();
  const existing = routePreloadInflight.get(key);
  if (existing) return existing;
  const promise = preload()
    .then((value) => {
      prefetchedRouteChunks.add(key);
      return value;
    })
    .finally(() => routePreloadInflight.delete(key));
  routePreloadInflight.set(key, promise);
  return promise;
}

export function canPrefetchRouteChunks() {
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$|slow-2g/i.test(connection.effectiveType)) return false;
  return true;
}

export function preloadLikelyRoute(key: string, moduleVisibility?: Record<string, boolean>, moduleKey?: string | string[]) {
  if (!canPrefetchRouteChunks()) return;
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
