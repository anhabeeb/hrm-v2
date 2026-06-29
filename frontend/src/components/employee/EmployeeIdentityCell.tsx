import { Mail, MapPin, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { preloadLikelyRoute } from "../../lib/routePreload";
import { cn } from "../../lib/utils";
import type { Employee } from "../../types/employees";
import { StatusBadge } from "../ui/status-badge";
import { EmployeeAvatar } from "./EmployeeAvatar";

type IdentitySize = "sm" | "md" | "lg";

const sizeClasses: Record<IdentitySize, { avatar: string; title: string; meta: string; gap: string }> = {
  sm: { avatar: "h-8 w-8 text-[11px]", title: "text-sm", meta: "text-[11px]", gap: "gap-2" },
  md: { avatar: "h-10 w-10 text-xs", title: "text-sm", meta: "text-xs", gap: "gap-3" },
  lg: { avatar: "h-14 w-14 text-sm", title: "text-base", meta: "text-sm", gap: "gap-3" }
};

function initials(name?: string | null, number?: string | null) {
  const source = (name || number || "").trim();
  if (!source) return "";
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)).toUpperCase();
}

function canUseSecureAvatar(employee?: Partial<Employee> | null): employee is Employee {
  return Boolean(employee?.id && employee?.employee_no && employee?.full_name);
}

export function AvatarWithFallback({
  employee,
  token,
  name,
  employeeNumber,
  avatarUrl,
  profilePhotoUrl,
  size = "md",
  className
}: {
  employee?: Partial<Employee> | null;
  token?: string | null;
  name?: string | null;
  employeeNumber?: string | null;
  avatarUrl?: string | null;
  profilePhotoUrl?: string | null;
  size?: IdentitySize;
  className?: string;
}) {
  const classes = sizeClasses[size];
  if (token && canUseSecureAvatar(employee) && employee.profile_photo_document_id) {
    return <EmployeeAvatar employee={employee} token={token} size={size} />;
  }

  const src = profilePhotoUrl || avatarUrl;
  const value = initials(name ?? employee?.full_name ?? employee?.display_name, employeeNumber ?? employee?.employee_no);

  return (
    <div className={cn(classes.avatar, "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 font-semibold text-slate-600", className)}>
      {src ? <img src={src} alt={name ?? "Employee"} className="h-full w-full object-cover" /> : value || <UserRound className="h-4 w-4 text-slate-500" />}
    </div>
  );
}

export function ProfileMetaRow({ icon, label, value }: { icon?: ReactNode; label: string; value?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {icon ? <span className="text-slate-400">{icon}</span> : null}
      <span className="font-medium text-slate-500">{label}</span>
      <span className="truncate text-slate-700">{value ?? "-"}</span>
    </div>
  );
}

export function EmployeeIdentityCell({
  employee,
  token,
  employeeId,
  employeeName,
  employeeNumber,
  avatarUrl,
  profilePhotoUrl,
  departmentName,
  worksiteName,
  locationName,
  status,
  size = "sm",
  showMetadata = true,
  showStatus = false,
  to,
  className
}: {
  employee?: Partial<Employee> | null;
  token?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  employeeNumber?: string | null;
  avatarUrl?: string | null;
  profilePhotoUrl?: string | null;
  departmentName?: string | null;
  worksiteName?: string | null;
  locationName?: string | null;
  status?: string | null;
  size?: IdentitySize;
  showMetadata?: boolean;
  showStatus?: boolean;
  to?: string | null;
  className?: string;
}) {
  const name = employeeName ?? employee?.full_name ?? employee?.display_name ?? "Unknown employee";
  const number = employeeNumber ?? employee?.employee_no ?? employeeId ?? "";
  const location = worksiteName ?? locationName ?? employee?.location_name ?? null;
  const department = departmentName ?? employee?.department_name ?? null;
  const classes = sizeClasses[size];
  const preloadProfile = () => {
    if (to?.startsWith("/employees/")) preloadLikelyRoute("employee-profile");
  };
  const title = to ? <Link to={to} onMouseEnter={preloadProfile} onFocus={preloadProfile} className="hover:text-primary hover:underline">{name}</Link> : name;

  return (
    <div className={cn("flex min-w-[220px] items-center", classes.gap, className)}>
      <AvatarWithFallback
        employee={employee}
        token={token}
        name={name}
        employeeNumber={number}
        avatarUrl={avatarUrl}
        profilePhotoUrl={profilePhotoUrl}
        size={size}
      />
      <div className="min-w-0">
        <div className={cn("flex min-w-0 items-center gap-2 font-medium leading-tight text-slate-900", classes.title)}>
          <span className="truncate">{title}</span>
          {showStatus && status ? <StatusBadge value={status} /> : null}
        </div>
        {showMetadata ? (
          <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground", classes.meta)}>
            {number ? <span className="font-mono">{number}</span> : null}
            {department ? <span className="truncate">{department}</span> : null}
            {location ? <span className="truncate">{location}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmployeeProfileCard({
  employee,
  token,
  actions,
  children,
  className
}: {
  employee: Employee;
  token?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-white p-4 shadow-panel", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <EmployeeIdentityCell
          employee={employee}
          token={token}
          size="lg"
          showStatus
          status={employee.status_name ?? employee.status_key}
          departmentName={employee.department_name}
          locationName={employee.location_name}
          employeeName={employee.full_name}
          employeeNumber={employee.employee_no}
        />
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ProfileMetaRow icon={<UserRound className="h-3.5 w-3.5" />} label="Type" value={`${employee.employee_type} / ${employee.employment_type}`} />
        <ProfileMetaRow icon={<MapPin className="h-3.5 w-3.5" />} label="Worksite" value={employee.location_name ?? "-"} />
        <ProfileMetaRow label="Position" value={employee.position_title ?? "-"} />
        <ProfileMetaRow label="Joined" value={employee.joining_date ?? "-"} />
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function UserProfileCard({
  name,
  email,
  subtitle,
  status,
  actions,
  className
}: {
  name: string;
  email?: string | null;
  subtitle?: string | null;
  status?: string | null;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-white p-4 shadow-panel", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarWithFallback name={name} employeeNumber={email} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="truncate">{name}</span>
              {status ? <StatusBadge value={status} /> : null}
            </div>
            <ProfileMetaRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={email ?? "-"} />
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
