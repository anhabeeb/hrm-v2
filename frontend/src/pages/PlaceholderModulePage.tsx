import { MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

interface PlaceholderModulePageProps {
  title: string;
  permission: string;
}

export function PlaceholderModulePage({ title, permission }: PlaceholderModulePageProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">Foundation route prepared for the next implementation phase.</p>
        </div>
        <Button size="sm" disabled>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title} records</h2>
            <p className="text-xs text-muted-foreground">Tables here are sized for large operational datasets.</p>
          </div>
          <Badge tone="neutral">{permission}</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState title="No records yet" description={`${title} workflows are intentionally left for a later prompt.`} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Row action pattern</h2>
          <Button variant="ghost" size="icon" title="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-4 py-3 text-sm text-muted-foreground">Prepared for compact edit, archive, document, and audit actions.</div>
      </Panel>
    </div>
  );
}
