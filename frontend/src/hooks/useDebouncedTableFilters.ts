import { useEffect, useState } from "react";

export function useDebouncedTableFilters<TFilters>(filters: TFilters, delayMs = 300) {
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    setIsDebouncing(true);
    const id = window.setTimeout(() => {
      setDebouncedFilters(filters);
      setIsDebouncing(false);
    }, delayMs);
    return () => {
      window.clearTimeout(id);
    };
  }, [delayMs, filters]);

  return { debouncedFilters, isDebouncing };
}
