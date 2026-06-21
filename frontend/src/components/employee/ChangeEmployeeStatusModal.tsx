import { useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { Employee, EmployeeStatusSetting } from "../../types/employees";

interface ChangeEmployeeStatusModalProps {
  employee: Employee;
  statuses: EmployeeStatusSetting[];
  error?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: { status_id: string; reason?: string | null; exit_date?: string | null; exit_reason?: string | null }) => void;
}

export function ChangeEmployeeStatusModal({ employee, statuses, error, saving, onClose, onSubmit }: ChangeEmployeeStatusModalProps) {
  const [statusId, setStatusId] = useState(employee.status_id);
  const [reason, setReason] = useState("");
  const [exitDate, setExitDate] = useState(employee.exit_date ?? "");
  const [exitReason, setExitReason] = useState(employee.exit_reason ?? "");
  const [validation, setValidation] = useState<string | null>(null);

  const selectedStatus = useMemo(() => statuses.find((status) => status.id === statusId), [statusId, statuses]);
  const requiresExitReason = Boolean(selectedStatus?.requires_exit_reason);
  const requiresExitDate = Boolean(selectedStatus?.requires_exit_date);

  function submit() {
    setValidation(null);
    if (!statusId) {
      setValidation("Select a new status.");
      return;
    }
    if (requiresExitDate && !exitDate) {
      setValidation("Exit date is required for the selected status.");
      return;
    }
    if (requiresExitReason && !exitReason && !reason) {
      setValidation("Exit reason or reason is required for the selected status.");
      return;
    }
    onSubmit({
      status_id: statusId,
      reason: reason || null,
      exit_date: exitDate || null,
      exit_reason: exitReason || reason || null
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Change employee status</h2>
            <p className="text-xs text-muted-foreground">
              {employee.full_name} - {employee.employee_no}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Current status</p>
              <Badge tone="neutral" className="mt-1">{employee.status_name ?? employee.status_key ?? "Unknown"}</Badge>
            </div>
            <div className="space-y-1.5">
              <Label>New status</Label>
              <select
                value={statusId}
                onChange={(event) => setStatusId(event.target.value)}
                className="h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {statuses.filter((status) => status.is_active).map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional status-change reason" />
            </div>
            {(requiresExitDate || selectedStatus?.requires_exit_reason || selectedStatus?.requires_final_settlement) ? (
              <div className="space-y-1.5">
                <Label>Exit date {requiresExitDate ? <span className="text-red-600">*</span> : null}</Label>
                <Input type="date" value={exitDate} onChange={(event) => setExitDate(event.target.value)} />
              </div>
            ) : null}
            {(requiresExitReason || selectedStatus?.requires_final_settlement) ? (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Exit reason {requiresExitReason ? <span className="text-red-600">*</span> : null}</Label>
                <Input value={exitReason} onChange={(event) => setExitReason(event.target.value)} placeholder="Exit reason for inactive/exit statuses" />
              </div>
            ) : null}
          </div>

          {selectedStatus ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Requirements: {[
                selectedStatus.requires_exit_date && "exit date",
                selectedStatus.requires_exit_reason && "exit reason",
                selectedStatus.requires_final_settlement && "final settlement",
                selectedStatus.requires_document_clearance && "document clearance",
                selectedStatus.requires_asset_clearance && "asset clearance"
              ].filter(Boolean).join(", ") || "none"}
            </div>
          ) : null}

          {validation || error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation ?? error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            Save status
          </Button>
        </div>
      </div>
    </div>
  );
}
