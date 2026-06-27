const DEFAULT_REFERENCE_DATA_TTL_MS = 15 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

function tokenScope(token?: string | null) {
  return token ? token.slice(0, 16) : "anonymous";
}

function scopedKey(key: string, token?: string | null) {
  return `${tokenScope(token)}:${key}`;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const referenceDataCache = {
  get<T>(key: string, token?: string | null): T | null {
    const entry = store.get(scopedKey(key, token));
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(scopedKey(key, token));
      return null;
    }
    return entry.value as T;
  },

  set<T>(key: string, value: T, token?: string | null, ttlMs = DEFAULT_REFERENCE_DATA_TTL_MS) {
    store.set(scopedKey(key, token), { value, expiresAt: Date.now() + ttlMs });
    return value;
  },

  async getOrLoad<T>(key: string, token: string | null | undefined, loader: () => Promise<T>, ttlMs = DEFAULT_REFERENCE_DATA_TTL_MS) {
    const cached = this.get<T>(key, token);
    if (cached) return cached;
    const cacheKey = scopedKey(key, token);
    const existing = inflight.get(cacheKey) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = loader()
      .then((value) => this.set(key, value, token, ttlMs))
      .finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, promise);
    return promise;
  },

  invalidate(prefix?: string) {
    for (const key of Array.from(store.keys())) {
      const unscoped = key.split(":").slice(1).join(":");
      if (!prefix || unscoped.startsWith(prefix)) store.delete(key);
    }
    for (const key of Array.from(inflight.keys())) {
      const unscoped = key.split(":").slice(1).join(":");
      if (!prefix || unscoped.startsWith(prefix)) inflight.delete(key);
    }
  }
};

export function invalidateReferenceDataCache(prefix?: string) {
  referenceDataCache.invalidate(prefix);
}
