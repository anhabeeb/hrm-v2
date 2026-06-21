import {
  BarChart3,
  Building2,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Shirt,
  UserRound,
  Users
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";

const navItems = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "Employees", to: "/employees", icon: Users, permission: "employees.view" },
  { label: "KYC Requests", to: "/employees/kyc-requests", icon: UserRound, permissionAny: ["employees.update", "employees.sensitive.update"] },
  { label: "Attendance", to: "/attendance", icon: CalendarCheck, permission: "attendance.view" },
  { label: "Leave", to: "/leave", icon: ClipboardList, permission: "leave.view" },
  { label: "Payroll", to: "/payroll", icon: BriefcaseBusiness, permission: "payroll.view" },
  { label: "Roster", to: "/roster", icon: CalendarDays, permission: "roster.view" },
  { label: "Documents", to: "/documents", icon: FileText, permission: "documents.view" },
  { label: "Assets & Uniforms", to: "/assets", icon: Shirt, permission: "assets.view" },
  { label: "Reports", to: "/reports", icon: BarChart3, permission: "reports.view" },
  { label: "Settings", to: "/settings", icon: Settings, permission: "settings.view" },
  { label: "Organization", to: "/settings/organization", icon: Building2, permission: "organization.view" },
  { label: "Users & Access", to: "/users-access", icon: ShieldCheck, permission: "users.view" }
];

export function AppShell() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const permissions = new Set(user?.permissions ?? []);
  const visibleNav = navItems.filter((item) => ("permissionAny" in item && item.permissionAny ? item.permissionAny.some((permission) => permissions.has(permission)) : permissions.has(item.permission)));
  const selfServiceVisible = Boolean(user?.employee_id);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex border-r bg-white transition-all duration-200 lg:static",
          collapsed ? "w-[72px]" : "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex min-h-0 w-full flex-col">
          <div className="flex h-14 items-center border-b px-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              HR
            </div>
            {!collapsed ? (
              <div className="ml-3 min-w-0">
                <p className="truncate text-sm font-semibold">HRM v2</p>
                <p className="truncate text-xs text-muted-foreground">People operations</p>
              </div>
            ) : null}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <div className="space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                        collapsed ? "justify-center" : "gap-3",
                        isActive && "bg-accent text-accent-foreground"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                );
              })}
              {selfServiceVisible ? (
                <NavLink
                  to="/self-service"
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? "Self-Service" : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                      collapsed ? "justify-center" : "gap-3",
                      isActive && "bg-accent text-accent-foreground"
                    )
                  }
                >
                  <UserRound className="h-4 w-4 shrink-0" />
                  {!collapsed ? <span className="truncate">Self-Service</span> : null}
                </NavLink>
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

      {mobileOpen ? <button className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-white px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} title="Open navigation">
              <Menu className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-sm font-semibold">Admin workspace</p>
              <p className="text-xs text-muted-foreground">Secure HR operations dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
              {user?.name.slice(0, 2).toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={() => void logout()} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-4 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
