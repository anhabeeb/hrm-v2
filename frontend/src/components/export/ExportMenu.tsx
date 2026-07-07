import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { ActionTextButton } from "../ui/action-button";
import { Panel } from "../ui/panel";
import { exportRows, type ExportColumn, type ExportRow } from "../../lib/export-utils";

export type ExportMenuProps = {
  moduleName: string;
  rows: ExportRow[];
  columns: Array<string | ExportColumn>;
  disabled?: boolean;
  filterSummary?: string[];
  onBackendExport?: (format: "xlsx" | "pdf") => Promise<void>;
  variant?: "button" | "plain";
};

export function ExportMenu({ moduleName, rows, columns, disabled, filterSummary = [], onBackendExport, variant = "button" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<"xlsx" | "pdf" | null>(null);

  async function run(format: "xlsx" | "pdf") {
    setRunning(format);
    try {
      if (onBackendExport) await onBackendExport(format);
      else exportRows(format, moduleName, columns, rows, filterSummary);
      setOpen(false);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="relative inline-flex">
      {variant === "plain" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      ) : (
        <ActionTextButton intent="export" size="sm" onClick={() => setOpen((value) => !value)} disabled={disabled}>
          <Download className="h-4 w-4" />
          Export
        </ActionTextButton>
      )}
      {open ? (
        <Panel className="absolute right-0 top-10 z-30 w-56 p-2 shadow-xl">
          <div className="px-2 pb-2 text-xs font-medium text-muted-foreground">Export {moduleName}</div>
          <div className="grid gap-1">
            <ActionTextButton intent="export" size="sm" className="justify-start" onClick={() => void run("xlsx")} disabled={Boolean(running)}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel .xlsx
            </ActionTextButton>
            <ActionTextButton intent="export" size="sm" className="justify-start" onClick={() => void run("pdf")} disabled={Boolean(running)}>
              <FileText className="h-4 w-4" />
              PDF
            </ActionTextButton>
          </div>
          {!rows.length && !onBackendExport ? <p className="px-2 pt-2 text-xs text-muted-foreground">No rows are currently available to export.</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
