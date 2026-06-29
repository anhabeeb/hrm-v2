import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CommandPalette, LoadingSkeleton } from "../ui/page-shell";
import { StatusBadge } from "../ui/status-badge";
import { APP_BRANDING } from "../../config/branding";
import { useAuth } from "../../hooks/useAuth";
import { api, type GlobalSearchGroup, type GlobalSearchItem, type GlobalSearchWarning } from "../../lib/api";
import { cn } from "../../lib/utils";

const SEARCH_UNAVAILABLE_MESSAGE = "Search is temporarily unavailable. Please try again.";
const SEARCH_RETRY_DELAY_MS = 10000;
const GLOBAL_SEARCH_DEBOUNCE_MS = 350;

function flattenGroups(groups: GlobalSearchGroup[]) {
  return groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.module })));
}

function isInternalRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("//") && !/^\/?https?:/i.test(route));
}

export function GlobalSearch() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastFailedQueryRef = useRef<string | null>(null);
  const retryBlockedUntilRef = useRef(0);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [warnings, setWarnings] = useState<GlobalSearchWarning[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const items = useMemo(() => flattenGroups(groups), [groups]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const active = items[activeIndex];
        if (active) openResult(active);
        else if (query.trim()) openSearchPage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, items, open, query]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    const trimmedQuery = query.trim();
    const handle = window.setTimeout(async () => {
      if (lastFailedQueryRef.current === trimmedQuery && Date.now() < retryBlockedUntilRef.current) {
        setLoading(false);
        setGroups([]);
        setWarnings([]);
        setError(SEARCH_UNAVAILABLE_MESSAGE);
        return;
      }
      setLoading(true);
      setError(null);
      setWarnings([]);
      try {
        const result = await api.globalSearch(token, { q: query, limit: 8 });
        if (!cancelled) {
          setGroups(result.groups ?? []);
          setWarnings(result.warnings ?? []);
          setActiveIndex(0);
          lastFailedQueryRef.current = null;
          retryBlockedUntilRef.current = 0;
        }
      } catch {
        if (!cancelled) {
          setGroups([]);
          setWarnings([]);
          setError(SEARCH_UNAVAILABLE_MESSAGE);
          lastFailedQueryRef.current = trimmedQuery;
          retryBlockedUntilRef.current = Date.now() + SEARCH_RETRY_DELAY_MS;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmedQuery ? GLOBAL_SEARCH_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, retryKey, token]);

  function openResult(item: GlobalSearchItem) {
    if (!isInternalRoute(item.route)) return;
    setOpen(false);
    navigate(item.route);
  }

  function openSearchPage() {
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="relative">
      <div className="hidden xl:block">
        <Search className="pointer-events-none absolute left-3 top-2.5 z-10 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder="Search employees, payroll, documents..."
          aria-label="Global search"
          className="h-9 w-[280px] bg-slate-50 pl-9 pr-16"
        />
        <span className="pointer-events-none absolute right-2 top-2 rounded border bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ctrl K</span>
      </div>
      <Button variant="outline" size="icon" className="xl:hidden" title="Search" onClick={() => {
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }}>
        <Search className="h-4 w-4" />
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,38rem)]">
          <CommandPalette placeholder={query.trim() ? "Search results" : `Quick links and recent ${APP_BRANDING.appShortName} workspace areas`}>
            <div className="mb-2 xl:hidden">
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees, payroll, documents..."
                aria-label="Global search"
              />
            </div>
            {loading ? <LoadingSkeleton rows={3} /> : null}
            {error ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      lastFailedQueryRef.current = null;
                      retryBlockedUntilRef.current = 0;
                      setRetryKey((value) => value + 1);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : null}
            {!loading && !error && warnings.length ? (
              <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Some search areas could not be loaded. Available results are shown below.
              </div>
            ) : null}
            {!loading && !error ? (
              groups.length ? (
                <div className="max-h-[28rem] overflow-y-auto pr-1">
                  {groups.map((group) => (
                    <div key={group.module} className="mb-3 last:mb-0">
                      <div className="mb-1 flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.module}</p>
                        <Badge>{group.items.length}</Badge>
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const flatIndex = items.findIndex((candidate) => candidate.id === item.id && candidate.type === item.type);
                          const active = flatIndex === activeIndex;
                          return (
                            <Button
                              key={`${group.module}-${item.type}-${item.id}`}
                              type="button"
                              variant="ghost"
                              className={cn("h-auto w-full justify-start rounded-md px-3 py-2 text-left", active && "bg-primary/10 text-primary")}
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => openResult(item)}
                              title={item.route}
                            >
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium">{item.title}</span>
                                {item.subtitle ? <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                              </span>
                              {item.status ? <StatusBadge value={item.status} className="ml-3 shrink-0" /> : null}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-slate-900">{query.trim() ? "No matching records" : "Start typing to search HRM"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {query.trim() ? "Only records you are allowed to access will appear here." : "Search employees, payroll, documents, approvals, settings, and more."}
                  </p>
                </div>
              )
            ) : null}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>Use Up/Down and Enter</span>
              <Button variant="ghost" size="sm" onClick={openSearchPage} disabled={!query.trim()}>Open full results</Button>
            </div>
          </CommandPalette>
        </div>
      ) : null}
    </div>
  );
}
