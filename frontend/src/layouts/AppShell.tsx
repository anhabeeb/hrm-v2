import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSignature,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Shirt,
  UserRound,
  Users
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  permissionAny?: string[];
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Dashboard",
    items: [{ label: "Dashboard", to: "/", icon: LayoutDashboard, permission: "dashboard.view" }]
  },
  {
    label: "Employees",
    items: [
      { label: "Employees", to: "/employees", icon: Users, permission: "employees.view" },
      { label: "KYC Requests", to: "/employees/kyc-requests", icon: UserRound, permissionAny: ["employees.update", "employees.sensitive.update"] },
      { label: "Contracts", to: "/contracts", icon: FileSignature, permissionAny: ["contracts.view", "employees.contracts.view"] }
    ]
  },
  {
    label: "Lifecycle",
    items: [
      { label: "Onboarding", to: "/onboarding", icon: CheckCircle2, permissionAny: ["onboarding.dashboard.view", "onboarding.cases.view", "employees.lifecycle.view"] },
      { label: "Offboarding", to: "/offboarding", icon: Archive, permissionAny: ["offboarding.dashboard.view", "offboarding.cases.view", "employees.lifecycle.view"] },
      { label: "Approvals", to: "/approvals", icon: GitBranch, permissionAny: ["approvals.view", "approvals.inbox.view", "approvals.instances.view"] }
    ]
  },
  {
    label: "Time & Attendance",
    items: [
      { label: "Attendance", to: "/attendance", icon: CalendarCheck, permission: "attendance.view" },
      { label: "Roster", to: "/roster", icon: CalendarDays, permission: "roster.view" },
      { label: "Leave", to: "/leave", icon: ClipboardList, permission: "leave.view" }
    ]
  },
  {
    label: "Payroll",
    items: [{ label: "Payroll", to: "/payroll", icon: BriefcaseBusiness, permission: "payroll.view" }]
  },
  {
    label: "Documents",
    items: [{ label: "Documents", to: "/documents", icon: FileText, permission: "documents.view" }]
  },
  {
    label: "Assets",
    items: [{ label: "Assets & Uniforms", to: "/assets", icon: Shirt, permission: "assets.view" }]
  },
  {
    label: "Reports",
    items: [{ label: "Reports", to: "/reports", icon: BarChart3, permission: "reports.view" }]
  },
  {
    label: "Settings",
    items: [
      { label: "Settings", to: "/settings", icon: Settings, permission: "settings.view" },
      { label: "Organization", to: "/settings/organization", icon: Building2, permission: "organization.view" },
      { label: "Admin Controls", to: "/settings/admin", icon: ShieldCheck, permissionAny: ["admin.settings_hub.view", "admin.modules.view", "admin.system_health.view"] },
      { label: "Users & Access", to: "/users-access", icon: ShieldCheck, permission: "users.view" }
    ]
  }
];

function canShow(item: NavItem, permissions: Set<string>) {
  if (item.permissionAny?.length) return item.permissionAny.some((permission) => permissions.has(permission));
  return item.permission ? permissions.has(item.permission) : true;
}

function routeTitle(pathname: string) {
  if (pathname === "/") return "Dashboard";
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[0] ?? "Dashboard";
  return segment.split("-").map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function AdminShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SelfServiceShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const visibleGroups = useMemo(() => navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canShow(item, permissions)) }))
    .filter((group) => group.items.length), [permissions]);
  const selfServiceVisible = Boolean(user?.employee_id);
  const title = routeTitle(location.pathname);

  return (
    <AdminShell>
      <div className="flex min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6f6_100%)]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex border-r bg-white/95 shadow-sm backdrop-blur transition-all duration-200 lg:static",
            collapsed ? "w-[76px]" : "w-[268px]",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex h-16 items-center border-b px-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                HR
              </div>
              {!collapsed ? (
                <div className="ml-3 min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">HRM v2</p>
                  <p className="truncate text-xs text-muted-foreground">Enterprise people suite</p>
                </div>
              ) : null}
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <div className="space-y-5">
                {visibleGroups.map((group) => (
                  <div key={group.label}>
                    {!collapsed ? <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p> : null}
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/"}
                            onClick={() => setMobileOpen(false)}
                            title={collapsed ? item.label : undefined}
                            className={({ isActive }) =>
                              cn(
                                "flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                                collapsed ? "justify-center" : "gap-3",
                                isActive && "bg-primary/10 text-primary ring-1 ring-primary/10"
                              )
                            }
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!collapsed ? <span className="truncate">{item.label}</span> : null}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {selfServiceVisible ? (
                  <SelfServiceShell>
                    <div>
                      {!collapsed ? <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Self-Service</p> : null}
                      <NavLink
                        to="/self-service"
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? "Self-Service" : undefined}
                        className={({ isActive }) =>
                          cn(
                            "flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                            collapsed ? "justify-center" : "gap-3",
                            isActive && "bg-primary/10 text-primary ring-1 ring-primary/10"
                          )
                        }
                      >
                        <UserRound className="h-4 w-4 shrink-0" />
                        {!collapsed ? <span className="truncate">Self-Service</span> : null}
                      </NavLink>
                    </div>
                  </SelfServiceShell>
                ) : null}
              </div>
            </nav>

            <div className="border-t p-2">
              <Button
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                className={cn("w-full", collapsed ? "" : "justify-start")}
                onClick={() => setCollapsed((value) => !value)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                {!collapsed ? <span>Collapse</span> : null}
              </Button>
            </div>
          </div>
        </aside>

        {mobileOpen ? <button className="fixed inset-0 z-30 bg-slate-900/25 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} title="Open navigation">
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>HRM v2</span>
                  <span>/</span>
                  <span className="truncate">{title}</span>
                </div>
                <p className="truncate text-sm font-semibold text-slate-950">Admin workspace</p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden h-9 w-[280px] items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm text-muted-foreground xl:flex">
                <Search className="h-4 w-4" />
                <span className="truncate">Search employees, payroll, documents...</span>
              </div>
              <Button variant="outline" size="icon" title="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              <div className="hidden text-right sm:block">
                <p className="max-w-[160px] truncate text-sm font-medium">{user?.name}</p>
                <p className="max-w-[180px] truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted text-xs font-semibold text-slate-700">
                {user?.name.slice(0, 2).toUpperCase()}
              </div>
              <Button variant="ghost" size="icon" onClick={() => void logout()} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-4 lg:px-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AdminShell>
  );
}
