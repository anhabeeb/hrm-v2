import { useCallback, useEffect, useRef, useState } from "react";
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
  const loadRef = useRef(load);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    loadRef.current = load;
    fallbackRef.current = fallback;
  }, [fallback, load]);

  const refresh = useCallback(async () => {
    if (!token || !enabled) return fallbackRef.current;
    setLoading(true);
    setError(null);
    try {
      const value = await referenceDataCache.getOrLoad(cacheKey, token, () => loadRef.current(), ttlMs);
      setData(value);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference data could not be loaded.");
      return fallbackRef.current;
    } finally {
      setLoading(false);
    }
  }, [cacheKey, enabled, token, ttlMs]);

  useEffect(() => {
    let active = true;
    if (!token || !enabled) {
      return () => { active = false; };
    }
    const cached = referenceDataCache.get<T>(cacheKey, token);
    if (cached) {
      setData(cached);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    referenceDataCache.getOrLoad(cacheKey, token, () => loadRef.current(), ttlMs)
      .then((value) => { if (active) setData(value); })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Reference data could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cacheKey, enabled, token, ttlMs]);

  return { data, loading, error, refresh };
}
