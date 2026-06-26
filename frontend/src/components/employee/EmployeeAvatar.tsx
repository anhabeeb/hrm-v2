import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Employee } from "../../types/employees";

function initials(employee: Employee) {
  const source = employee.display_name || employee.full_name || employee.employee_no;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return value.toUpperCase();
}

export function EmployeeAvatar({ employee, token, size = "md" }: { employee: Employee; token: string | null; size?: "sm" | "md" | "lg" }) {
  const [url, setUrl] = useState<string | null>(null);
  const classes = size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm";

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    async function load() {
      if (!token || !employee.profile_photo_document_id) {
        setUrl(null);
        return;
      }
      try {
        const result = await api.streamEmployeeProfilePhoto(token, employee.id);
        objectUrl = URL.createObjectURL(result.blob);
        if (active) setUrl(objectUrl);
      } catch {
        if (active) setUrl(null);
      }
    }
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employee.id, employee.profile_photo_document_id, employee.updated_at, token]);

  return (
    <div className={`${classes} flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted font-semibold text-muted-foreground`}>
      {url ? <img src={url} alt={employee.full_name} className="h-full w-full object-cover" /> : initials(employee) || <UserRound className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}
