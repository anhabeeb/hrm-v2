import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Employee } from "../../types/employees";

export function EmployeeAvatar({ employee, token, size = "md" }: { employee: Employee; token: string | null; size?: "sm" | "md" | "lg" }) {
  const [url, setUrl] = useState<string | null>(null);
  const classes = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    async function load() {
      if (!token || !employee.profile_photo_document_id) {
        setUrl(null);
        return;
      }
      try {
        const result = await api.fetchEmployeeProfilePhoto(token, employee.id);
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
  }, [employee.id, employee.profile_photo_document_id, token]);

  return (
    <div className={`${classes} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted`}>
      {url ? <img src={url} alt={employee.full_name} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}
