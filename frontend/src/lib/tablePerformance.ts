import { isPerformanceDebugEnabled } from "./debugFlags";

export const DEFAULT_TABLE_PAGE_SIZE = 25;
export const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const MAX_TABLE_PAGE_SIZE = 100;
export const VIRTUALIZATION_ROW_THRESHOLD = 100;

export interface TablePaginationRequest {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export interface TablePaginationMeta {
  limit?: number;
  offset?: number;
  has_more?: boolean;
  total?: number;
}

const MAX_RECORDED_TABLE_EVENTS = 100;
const tableEvents: Array<Record<string, unknown>> = [];

export function clampTablePageSize(value: unknown, fallback = DEFAULT_TABLE_PAGE_SIZE) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const whole = Math.trunc(parsed);
  return Math.max(1, Math.min(MAX_TABLE_PAGE_SIZE, whole));
}

export function normalizeTablePage(value: unknown) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

export function getTablePaginationRequest(input: { page: unknown; pageSize: unknown }): TablePaginationRequest {
  const page = normalizeTablePage(input.page);
  const pageSize = clampTablePageSize(input.pageSize);
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null && item !== "")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function stableTableFilterSignature(value: unknown) {
  return JSON.stringify(stableValue(value ?? {}));
}

export function buildTableQueryKeyParts(input: {
  scope: string | null | undefined;
  tableName: string;
  page: number;
  pageSize: number;
  filters?: unknown;
  search?: string;
  sort?: unknown;
}) {
  return [
    "hrm-v2",
    "table",
    input.scope || "default-scope",
    input.tableName,
    `page:${input.page}`,
    `pageSize:${input.pageSize}`,
    `filters:${stableTableFilterSignature(input.filters)}`,
    `search:${input.search ?? ""}`,
    `sort:${stableTableFilterSignature(input.sort)}`
  ] as const;
}

export function shouldVirtualizeRows(rowCount: number, threshold = VIRTUALIZATION_ROW_THRESHOLD) {
  return rowCount > threshold;
}

export function createLookupMap<T extends Record<string, unknown>>(rows: T[] | undefined, idKey: keyof T, labelKey: keyof T) {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const id = row[idKey];
    const label = row[labelKey];
    if (id !== undefined && id !== null) map.set(String(id), label === undefined || label === null ? String(id) : String(label));
  }
  return map;
}

function pushTableEvent(event: Record<string, unknown>) {
  tableEvents.push({ ...event, created_at: new Date().toISOString() });
  if (tableEvents.length > MAX_RECORDED_TABLE_EVENTS) tableEvents.splice(0, tableEvents.length - MAX_RECORDED_TABLE_EVENTS);
  if (isPerformanceDebugEnabled()) console.debug("[performance:table]", tableEvents[tableEvents.length - 1]);
}

export function trackTableQueryPerformance(input: {
  tableName: string;
  queryKey: readonly unknown[];
  durationMs?: number;
  rowCount?: number;
  pageSize: number;
  cacheState: "first-load" | "background-refresh" | "settled" | "error";
}) {
  pushTableEvent({
    table_name: input.tableName,
    query_key: input.queryKey.map((part) => String(part).slice(0, 80)).join(":"),
    duration_ms: input.durationMs == null ? null : Math.round(input.durationMs),
    row_count: input.rowCount ?? null,
    page_size: input.pageSize,
    cache_state: input.cacheState
  });
}

export function recordCancelledTableRequest(tableName: string) {
  pushTableEvent({ table_name: tableName, event: "cancelled-stale-request" });
}

export function getTablePerformanceSnapshot() {
  return [...tableEvents];
}
