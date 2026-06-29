import { AlertTriangle, FileSearch, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { APP_BRANDING } from "../config/branding";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type MigrationStatus = Awaited<ReturnType<typeof api.getMigrationStatus>>;

const labels: Record<string, string> = {
  employees: "Employees",
  organization: "Organization data",
  documents_metadata: "Documents metadata",
  payroll_opening_balances: "Payroll opening balances",
  leave_balances: "Leave balances"
};

export function ImportMigrationPage() {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [importType, setImportType] = useState("employees");
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canValidate = Boolean(user?.permissions.includes("settings.manage"));

  async function load() {
    if (!token) return;
    setError(null);
    try {
      setStatus(await api.getMigrationStatus(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration status could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function validate(event: FormEvent) {
    event.preventDefault();
    if (!token || !canValidate) return;
    setMessage(null);
    setError(null);
    try {
      const result = await api.validateMigrationCsvPlaceholder(token, { import_type: importType, filename: filename || null });
      setMessage(`${result.import_type} validation placeholder accepted. Imported rows: ${result.imported_rows}. ${result.warnings.join(" ")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation placeholder failed.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Import / Migration"
        eyebrow="Data transfer"
        description={`Validation-only placeholders for future ${APP_BRANDING.appName} imports.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
          </Button>
        }
      />

      <Panel className="border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Migration safety warning</h2>
            <p className="mt-1 text-sm">{status?.warning ?? `${APP_BRANDING.appName} import/migration should be performed only after core setup is complete and backups are available.`}</p>
            <p className="mt-1 text-xs">No automatic migration or old HRM import is enabled in this phase.</p>
          </div>
        </div>
      </Panel>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">{message}</div> : null}

      <Panel className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Prepared import placeholders</h2>
          <p className="text-xs text-muted-foreground">These are foundations for future CSV validation, not active import jobs.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Behavior</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(status?.supported_placeholders ?? ["employees", "organization", "documents_metadata", "payroll_opening_balances", "leave_balances"]).map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{labels[key] ?? key}</TableCell>
                  <TableCell><Badge tone="warning">Validation only</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">No data is imported or modified.</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel className="p-4">
        <form onSubmit={(event) => void validate(event)} className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <SelectField aria-label="Import type" value={importType} onValueChange={setImportType}>
            {(status?.supported_placeholders ?? Object.keys(labels)).map((key) => <option key={key} value={key}>{labels[key] ?? key}</option>)}
          </SelectField>
          <Input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="Optional CSV filename for audit note" />
          <Button type="submit" disabled={!canValidate}>
            <FileSearch className="h-4 w-4" />
            Validate placeholder
          </Button>
        </form>
        {!canValidate ? <p className="mt-2 text-xs text-muted-foreground">Requires `settings.manage` permission.</p> : null}
      </Panel>
    </PageShell>
  );
}
