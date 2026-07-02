import { Button } from "../ui/button";
import { SelectField } from "../ui/page-shell";
import { TABLE_PAGE_SIZE_OPTIONS } from "../../lib/tablePerformance";

interface TablePaginationBarProps {
  page: number;
  pageSize: number;
  rowCount: number;
  hasMore?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function TablePaginationBar({ page, pageSize, rowCount, hasMore, onPageChange, onPageSizeChange }: TablePaginationBarProps) {
  const from = rowCount ? (page - 1) * pageSize + 1 : 0;
  const to = (page - 1) * pageSize + rowCount;
  return (
    <div className="flex flex-col gap-2 rounded-b-lg border border-t-0 bg-white px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        Showing <span className="font-medium text-slate-900">{from}-{to}</span>
        {hasMore ? " with more rows available" : " on this page"}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">Rows</span>
        <SelectField className="h-8 w-20 rounded-md border bg-white px-2 text-sm" value={String(pageSize)} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>
          {TABLE_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </SelectField>
        <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>Previous</Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={!hasMore}>Next</Button>
      </div>
    </div>
  );
}
