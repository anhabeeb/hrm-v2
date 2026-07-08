import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Briefcase,
  Building,
  CalendarClock,
  CalendarDays,
  Cast,
  Database,
  DollarSign,
  FileSignature,
  FileText,
  Flag,
  GitBranch,
  Hash,
  History,
  KeyRound,
  ListChecks,
  MapPin,
  Network,
  Shield,
  Shirt,
  ShieldCheck,
  ToggleRight,
  Users
} from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";

function CategorySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">{children}</div>
    </div>
  );
}

function IconCard({ to, icon, iconBg, iconColor, title, description }: { to: string; icon: ReactNode; iconBg: string; iconColor: string; title: string; description?: string }) {
  return (
    <Link to={to}>
      <Panel className="flex h-full items-center gap-3 p-3.5 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: iconBg }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-950">{title}</p>
          {description ? <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p> : null}
        </div>
      </Panel>
    </Link>
  );
}

function TileCard({ to, icon, iconColor, title, meta }: { to: string; icon: ReactNode; iconColor: string; title: string; meta?: string }) {
  return (
    <Link to={to}>
      <Panel className="flex h-full flex-col items-center gap-1.5 p-3 text-center transition hover:-translate-y-0.5 hover:shadow-md">
        <span style={{ color: iconColor }}>{icon}</span>
        <p className="text-[11px] font-medium text-slate-950">{title}</p>
        {meta ? <p className="text-[9px] text-muted-foreground">{meta}</p> : null}
      </Panel>
    </Link>
  );
}

export function SettingsHubPage() {
  return (
    <PageShell constrained={false}>
      <div className="space-y-5">
        <div>
          <p className="text-lg font-medium text-slate-950">Settings</p>
          <p className="mt-0.5 text-xs text-muted-foreground">System configuration, organized by what you're trying to do</p>
        </div>

        <CategorySection label="General">
          <IconCard to="/v3-preview/settings/organization" icon={<Building className="h-4 w-4" />} iconBg="#EEEDFE" iconColor="#26215C" title="Company profile" description="Name, registration, contact details" />
          <IconCard to="/v3-preview/settings/modules" icon={<ToggleRight className="h-4 w-4" />} iconBg="#E6F1FB" iconColor="#0C447C" title="Modules" description="Turn features on/off, with dependency checks" />
        </CategorySection>

        <CategorySection label="Organization">
          <TileCard to="/v3-preview/settings/organization" icon={<MapPin className="h-[18px] w-[18px]" />} iconColor="#5B4FE9" title="Outlets / locations" />
          <TileCard to="/v3-preview/settings/organization" icon={<Network className="h-[18px] w-[18px]" />} iconColor="#5B4FE9" title="Departments" />
          <TileCard to="/v3-preview/settings/organization" icon={<Briefcase className="h-[18px] w-[18px]" />} iconColor="#5B4FE9" title="Positions" />
          <TileCard to="/v3-preview/settings/organization" icon={<CalendarClock className="h-[18px] w-[18px]" />} iconColor="#5B4FE9" title="Job levels" />
        </CategorySection>

        <CategorySection label="Templates">
          <TileCard to="/v3-preview/leave/types-policies" icon={<CalendarDays className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Leave" meta="Types, policies, workflows" />
          <TileCard to="/v3-preview/roster/settings" icon={<Cast className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Roster" meta="Shift templates, weekly-off" />
          <TileCard to="/v3-preview/payroll/settings" icon={<DollarSign className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Payroll deductions" />
          <TileCard to="/v3-preview/settings/documents" icon={<FileText className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Documents" />
          <TileCard to="/v3-preview/assets/settings" icon={<Shirt className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Assets & uniforms" />
          <TileCard to="/v3-preview/settings/contracts" icon={<FileSignature className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Contracts" />
          <TileCard to="/v3-preview/approvals/workflows" icon={<GitBranch className="h-[18px] w-[18px]" />} iconColor="#F0997B" title="Approval workflows" />
        </CategorySection>

        <CategorySection label="Access control">
          <TileCard to="/v3-preview/users-access/users" icon={<Users className="h-[18px] w-[18px]" />} iconColor="#378ADD" title="Users" />
          <TileCard to="/v3-preview/users-access/roles" icon={<Shield className="h-[18px] w-[18px]" />} iconColor="#378ADD" title="Roles" />
          <TileCard to="/v3-preview/users-access/permissions" icon={<KeyRound className="h-[18px] w-[18px]" />} iconColor="#378ADD" title="Permissions" />
          <TileCard to="/v3-preview/users-access/role-mappings" icon={<GitBranch className="h-[18px] w-[18px]" />} iconColor="#378ADD" title="Role mappings" />
          <TileCard to="/v3-preview/users-access/access-scopes" icon={<MapPin className="h-[18px] w-[18px]" />} iconColor="#378ADD" title="Access scopes" />
        </CategorySection>

        <CategorySection label="Employee settings">
          <IconCard to="/v3-preview/employees/settings" icon={<Flag className="h-4 w-4" />} iconBg="#EAF3DE" iconColor="#27500A" title="Employee statuses" description="Active, on leave, pending setup..." />
          <IconCard to="/v3-preview/employees/settings" icon={<Hash className="h-4 w-4" />} iconBg="#EAF3DE" iconColor="#27500A" title="Employee numbering" description="EMP-0001 format & sequence" />
        </CategorySection>

        <CategorySection label="Admin & ops">
          <TileCard to="/v3-preview/settings/admin" icon={<ListChecks className="h-[18px] w-[18px]" />} iconColor="#6B6F86" title="Consistency" />
          <TileCard to="/v3-preview/audit" icon={<History className="h-[18px] w-[18px]" />} iconColor="#6B6F86" title="Audit & security" />
          <TileCard to="/settings/admin/backup-retention" icon={<Database className="h-[18px] w-[18px]" />} iconColor="#6B6F86" title="Backup & retention" />
          <TileCard to="/settings/performance" icon={<Activity className="h-[18px] w-[18px]" />} iconColor="#6B6F86" title="Performance" />
          <TileCard to="/settings/admin/imports" icon={<ShieldCheck className="h-[18px] w-[18px]" />} iconColor="#6B6F86" title="Data transfer" />
        </CategorySection>
      </div>
    </PageShell>
  );
}
