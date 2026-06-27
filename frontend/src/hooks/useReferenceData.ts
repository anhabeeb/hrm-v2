import { useCallback, useEffect, useState } from "react";
import { referenceDataCache } from "../lib/referenceDataCache";

export function useReferenceData<T>(input: {
  cacheKey: string;
  token?: string | null;
  enabled?: boolean;
  ttlMs?: number;
  load: () => Promise<T>;
  fallback: T;
}) {
  const { cacheKey, token, enabled = true, ttlMs, load, fallback } = input;
  const [data, setData] = useState<T>(() => referenceDataCache.get<T>(cacheKey, token) ?? fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !enabled) return fallback;
    setLoading(true);
    setError(null);
    try {
      const value = await referenceDataCache.getOrLoad(cacheKey, token, load, ttlMs);
      setData(value);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference data could not be loaded.");
      setData(fallback);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, [cacheKey, enabled, fallback, load, token, ttlMs]);

  useEffect(() => {
    let active = true;
    if (!token || !enabled) {
      setData(fallback);
      return () => { active = false; };
    }
    const cached = referenceDataCache.get<T>(cacheKey, token);
    if (cached) {
      setData(cached);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    referenceDataCache.getOrLoad(cacheKey, token, load, ttlMs)
      .then((value) => { if (active) setData(value); })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Reference data could not be loaded.");
        setData(fallback);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cacheKey, enabled, fallback, load, token, ttlMs]);

  return { data, loading, error, refresh };
}
