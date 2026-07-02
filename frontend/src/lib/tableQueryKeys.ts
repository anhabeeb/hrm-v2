import { buildTableQueryKeyParts } from "./tablePerformance";

export const tableQueryKeys = {
  list(scope: string | null | undefined, tableName: string, input: {
    page: number;
    pageSize: number;
    filters?: unknown;
    search?: string;
    sort?: unknown;
  }) {
    return buildTableQueryKeyParts({
      scope,
      tableName,
      page: input.page,
      pageSize: input.pageSize,
      filters: input.filters,
      search: input.search,
      sort: input.sort
    });
  }
};
