import { MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

interface PlaceholderModulePageProps {
  title: string;
  permission: string;
}

export function PlaceholderModulePage({ title, permission }: PlaceholderModulePageProps) {
  return (
    <PageShell>
      <PageHeader
        title={title}
        eyebrow="Foundation"
        description="Foundation route prepared for the next implementation phase."
        actions={
          <Button size="sm" disabled>
          <Plus className="h-4 w-4" />
          Add
          </Button>
        }
      />

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
          <RowActionButton intent="view" title="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </RowActionButton>
        </div>
        <div className="px-4 py-3 text-sm text-muted-foreground">Prepared for compact edit, archive, document, and audit actions.</div>
      </Panel>
    </PageShell>
  );
}
