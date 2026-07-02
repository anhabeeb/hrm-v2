import type { Context } from "hono";

export interface PaginationParams {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
}

export function parsePaginationParams(c: Context, options: { defaultLimit?: number; maxLimit?: number } = {}): PaginationParams {
  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 100;
  const rawLimit = Number(c.req.query("limit") ?? c.req.query("page_size") ?? defaultLimit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(maxLimit, Math.trunc(rawLimit))) : defaultLimit;
  const rawPage = Number(c.req.query("page") ?? 0);
  const rawOffset = c.req.query("offset") == null ? null : Number(c.req.query("offset"));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1;
  const offset = Number.isFinite(rawOffset) && rawOffset !== null
    ? Math.max(0, Math.trunc(rawOffset))
    : (page - 1) * limit;
  return { limit, offset, page, pageSize: limit };
}

export function buildSafeLimitOffset(pagination: PaginationParams) {
  return { sql: "LIMIT ? OFFSET ?", params: [pagination.limit, pagination.offset] as [number, number] };
}

export function parseSortParams(c: Context, allowList: Record<string, string>, fallback: { field: string; direction?: "ASC" | "DESC" }) {
  const requestedField = String(c.req.query("sort") ?? fallback.field);
  const field = allowList[requestedField] ? requestedField : fallback.field;
  const requestedDirection = String(c.req.query("direction") ?? fallback.direction ?? "ASC").toUpperCase();
  const direction = requestedDirection === "DESC" ? "DESC" : "ASC";
  return { field, column: allowList[field] ?? allowList[fallback.field], direction };
}

export function safeOrderByFromAllowList(c: Context, allowList: Record<string, string>, fallback: { field: string; direction?: "ASC" | "DESC" }) {
  const sort = parseSortParams(c, allowList, fallback);
  return `ORDER BY ${sort.column} ${sort.direction}`;
}

export function paginationMeta(pagination: PaginationParams, returnedRows: number) {
  return {
    limit: pagination.limit,
    offset: pagination.offset,
    page: pagination.page,
    page_size: pagination.pageSize,
    has_more: returnedRows === pagination.limit
  };
}
