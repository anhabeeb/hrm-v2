import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { rowLevelIssueFromImportRow, type ImportPreviewSummary } from "../../lib/import-utils";

export function ImportPreviewTable({ preview, rows }: { preview: ImportPreviewSummary | null; rows: Record<string, unknown>[] }) {
  const issues = rows.map(rowLevelIssueFromImportRow);
  if (!preview && !issues.length) return <EmptyState title="No validation preview yet" description="Upload a file and run validation to see row-level issues." />;
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Submitted value</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Suggested correction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue, index) => (
              <TableRow key={`${issue.row_number}-${issue.column_name}-${index}`}>
                <TableCell>{issue.row_number || "-"}</TableCell>
                <TableCell className="font-medium">{issue.column_name}</TableCell>
                <TableCell><Badge tone={issue.severity === "warning" ? "warning" : "danger"}>{issue.severity}</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{typeof issue.submitted_value === "object" ? JSON.stringify(issue.submitted_value) : String(issue.submitted_value ?? "")}</TableCell>
                <TableCell className="min-w-[260px]">{issue.error_message}</TableCell>
                <TableCell className="min-w-[220px] text-muted-foreground">{issue.suggested_correction}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!issues.length ? <EmptyState title="No row-level errors" description="Validation has not found errors for the visible rows." /> : null}
    </div>
  );
}
