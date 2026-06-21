import { Banknote, Building2, CalendarCheck, CalendarDays, ClipboardList, FileClock, FileSearch, FileText, Shirt, SlidersHorizontal, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const settingsRows = [
  { key: "bootstrap.completed", scope: "System", status: "Protected" },
  { key: "documents.storage", scope: "Prepared", status: "Pending R2 bucket" },
  { key: "security.jwt", scope: "Environment", status: "Required" }
];

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration foundation.</p>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Organization master data</h2>
              <p className="text-xs text-muted-foreground">Company profile, locations, departments, positions, and job levels.</p>
            </div>
          </div>
          <NavLink to="/settings/organization">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Roster management</h2>
              <p className="text-xs text-muted-foreground">Shift templates, weekly roster settings, reports, and publish controls.</p>
            </div>
          </div>
          <NavLink to="/roster/settings">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Leave management</h2>
              <p className="text-xs text-muted-foreground">Leave types, policies, deduction/document rules, and approval workflows.</p>
            </div>
          </div>
          <NavLink to="/leave/settings">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Attendance management</h2>
              <p className="text-xs text-muted-foreground">Attendance rules, devices, corrections, records, and report exports.</p>
            </div>
          </div>
          <NavLink to="/attendance/settings">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Payroll management</h2>
              <p className="text-xs text-muted-foreground">Payroll components, settings, periods, runs, advances, reports, and settlements.</p>
            </div>
          </div>
          <NavLink to="/payroll/settings">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Document management</h2>
              <p className="text-xs text-muted-foreground">Categories, document types, required rules, and registry settings.</p>
            </div>
          </div>
          <NavLink to="/settings/documents">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Shirt className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Assets & uniforms</h2>
              <p className="text-xs text-muted-foreground">Categories, item register, issue/return tracking, and deduction rules.</p>
            </div>
          </div>
          <NavLink to="/assets/categories">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <FileClock className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Employee notes & audit</h2>
              <p className="text-xs text-muted-foreground">Restricted note categories and the system audit timeline.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <NavLink to="/settings/employee-notes"><Button size="sm" variant="outline">Notes</Button></NavLink>
            <NavLink to="/audit"><Button size="sm" variant="outline">Audit</Button></NavLink>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Employee settings</h2>
              <p className="text-xs text-muted-foreground">Employee statuses and numbering rules.</p>
            </div>
          </div>
          <NavLink to="/employees/settings">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <FileSearch className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Import / migration</h2>
              <p className="text-xs text-muted-foreground">Validation-only CSV placeholders; old HRM remains reference-only.</p>
            </div>
          </div>
          <NavLink to="/settings/import-migration">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Configuration registry</h2>
            <p className="text-xs text-muted-foreground">Protected keys are stored in D1 system settings.</p>
          </div>
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settingsRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>{row.scope}</TableCell>
                  <TableCell>
                    <Badge tone={row.status === "Required" ? "warning" : "neutral"}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <EmptyState title="No editable settings yet" description="Settings management will be added after the protected RBAC workflows are expanded." />
      </Panel>
    </div>
  );
}
