import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActiveFilterChips, FilterResetButton, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { LoadingSkeleton, PageHeader, PageShell, StandardTabs } from "../components/ui/page-shell";
import { StatusBadge } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { api, type GlobalSearchGroup, type GlobalSearchItem } from "../lib/api";

const moduleFilters = [
  { key: "all", label: "All" },
  { key: "employee", label: "Employees" },
  { key: "payroll", label: "Payroll" },
  { key: "document", label: "Documents" },
  { key: "approval", label: "Approvals" },
  { key: "settings", label: "Settings" }
];

function isInternalRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("//") && !/^\/?https?:/i.test(route));
}

export function SearchResultsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [type, setType] = useState(params.get("type") ?? "all");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);
  const activeFilterChips = useMemo(() => [
    ...(query.trim() ? [{ key: "query", label: "Search", value: query.trim(), onRemove: () => { setQuery(""); setParams(type === "all" ? {} : { type }); } }] : []),
    ...(type !== "all" ? [{ key: "type", label: "Type", value: moduleFilters.find((item) => item.key === type)?.label ?? type, onRemove: () => { setType("all"); const next: Record<string, string> = {}; if (query.trim()) next.q = query.trim(); setParams(next); } }] : [])
  ], [query, setParams, type]);

  async function load(nextQuery = query, nextType = type) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.globalSearch(token, {
        q: nextQuery,
        limit: 25,
        types: nextType === "all" ? null : nextType
      });
      setGroups(result.groups);
    } catch (err) {
      setGroups([]);
      setError(err instanceof Error ? err.message : "Search is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextQuery = params.get("q") ?? "";
    const nextType = params.get("type") ?? "all";
    setQuery(nextQuery);
    setType(nextType);
    void load(nextQuery, nextType);
  }, [params, token]);

  function submitSearch() {
    const next: Record<string, string> = {};
    if (query.trim()) next.q = query.trim();
    if (type !== "all") next.type = type;
    setParams(next);
  }

  function openResult(item: GlobalSearchItem) {
    if (isInternalRoute(item.route)) navigate(item.route);
  }

  return (
    <PageShell>
      <PageHeader
        title="Search"
        description="Find permitted employees, payroll records, documents, approvals, reports, settings, and help content."
        icon={<Search className="h-5 w-5" />}
        actions={<Badge>{total} results</Badge>}
      />

      <div className="rounded-lg border bg-white p-3 shadow-panel">
        <StandardFilterBar
          search={<StandardSearchInput value={query} onValueChange={setQuery} placeholder="Search HRM records" ariaLabel="Search HRM records" />}
          reset={<FilterResetButton onReset={() => { setQuery(""); setType("all"); setParams({}); }} />}
          actions={<Button onClick={submitSearch}><Search className="h-4 w-4" /> Search</Button>}
        >
          <StandardSelectFilter value={type} onValueChange={setType} allLabel="All" width="status" options={moduleFilters.filter((item) => item.key !== "all").map((item) => ({ value: item.key, label: item.label }))} ariaLabel="Search type" />
        </StandardFilterBar>
        <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        <div className="mt-3">
          <StandardTabs
            items={moduleFilters.map((item) => ({ key: item.key, label: item.label }))}
            active={type}
            onChange={(key) => {
              setType(key);
              const next: Record<string, string> = {};
              if (query.trim()) next.q = query.trim();
              if (key !== "all") next.type = key;
              setParams(next);
            }}
            label="Search module filters"
            variant="scrollable"
          />
        </div>
      </div>

      {loading ? <LoadingSkeleton rows={6} /> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {!loading && !error && !groups.length ? <EmptyState title="No search results" description="Try a different query. Results are limited to records your account can access." /> : null}
      {!loading && !error ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.module} className="overflow-hidden rounded-lg border bg-white shadow-panel">
              <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">{group.module}</h2>
                <Badge>{group.items.length}</Badge>
              </div>
              <div className="divide-y">
                {group.items.map((item) => (
                  <Button
                    key={`${group.module}-${item.type}-${item.id}`}
                    variant="ghost"
                    className="h-auto w-full justify-start rounded-none px-4 py-3 text-left"
                    onClick={() => openResult(item)}
                    title={item.route}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-950">{item.title}</span>
                      {item.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                    </span>
                    <Badge className="ml-3 shrink-0">{item.type}</Badge>
                    {item.status ? <StatusBadge value={item.status} className="ml-2 shrink-0" /> : null}
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
