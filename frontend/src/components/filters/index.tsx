import { CalendarDays, Check, ChevronDown, Save, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SelectField } from "../ui/page-shell";
import { cn } from "../../lib/utils";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationPosition } from "../../types/organization";

export type StandardDateRange = {
  from?: string;
  to?: string;
};

export type StandardFilterOption = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

export type ActiveFilterChip = {
  key: string;
  label: string;
  value: ReactNode;
  title?: string;
  onRemove: () => void;
};

export const filterSelectMinWidths = {
  status: "min-w-[160px]",
  department: "min-w-[220px]",
  jobLevel: "min-w-[180px]",
  position: "min-w-[240px]",
  employee: "min-w-[260px]",
  payrollPeriod: "min-w-[220px]",
  documentType: "min-w-[240px]",
  leaveType: "min-w-[220px]",
  dateRange: "min-w-[260px]",
  default: "min-w-[180px]"
} as const;

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfQuarter(date: Date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

export const dateRangePresets = [
  {
    key: "today",
    label: "Today",
    getRange: () => {
      const today = new Date();
      return { from: isoDate(today), to: isoDate(today) };
    }
  },
  {
    key: "yesterday",
    label: "Yesterday",
    getRange: () => {
      const yesterday = addDays(new Date(), -1);
      return { from: isoDate(yesterday), to: isoDate(yesterday) };
    }
  },
  {
    key: "this-week",
    label: "This Week",
    getRange: () => ({ from: isoDate(startOfWeek(new Date())), to: isoDate(endOfWeek(new Date())) })
  },
  {
    key: "last-week",
    label: "Last Week",
    getRange: () => {
      const lastWeek = addDays(new Date(), -7);
      return { from: isoDate(startOfWeek(lastWeek)), to: isoDate(endOfWeek(lastWeek)) };
    }
  },
  {
    key: "this-month",
    label: "This Month",
    getRange: () => {
      const today = new Date();
      return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    }
  },
  {
    key: "last-month",
    label: "Last Month",
    getRange: () => {
      const today = new Date();
      return { from: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: isoDate(new Date(today.getFullYear(), today.getMonth(), 0)) };
    }
  },
  {
    key: "this-quarter",
    label: "This Quarter",
    getRange: () => {
      const today = new Date();
      const start = startOfQuarter(today);
      return { from: isoDate(start), to: isoDate(new Date(start.getFullYear(), start.getMonth() + 3, 0)) };
    }
  },
  {
    key: "this-year",
    label: "This Year",
    getRange: () => {
      const today = new Date();
      return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to: isoDate(new Date(today.getFullYear(), 11, 31)) };
    }
  },
  {
    key: "last-7-days",
    label: "Last 7 Days",
    getRange: () => ({ from: isoDate(addDays(new Date(), -6)), to: isoDate(new Date()) })
  },
  {
    key: "last-30-days",
    label: "Last 30 Days",
    getRange: () => ({ from: isoDate(addDays(new Date(), -29)), to: isoDate(new Date()) })
  },
  {
    key: "custom",
    label: "Custom Range",
    getRange: () => ({ from: "", to: "" })
  }
] as const;

export function formatDateRangeLabel(range: StandardDateRange, emptyLabel = "Date Range") {
  if (!range.from && !range.to) return emptyLabel;
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const format = (value?: string) => {
    if (!value) return "Any";
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return value;
    return formatter.format(new Date(year, month - 1, day));
  };
  if (range.from && range.to && range.from === range.to) return format(range.from);
  return `${format(range.from)} - ${format(range.to)}`;
}

export function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export function StandardFilterBar({
  search,
  children,
  moreFilters,
  reset,
  saveView,
  actions,
  className
}: {
  search?: ReactNode;
  children?: ReactNode;
  moreFilters?: ReactNode;
  reset?: ReactNode;
  saveView?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-standard-filter-bar
      className={cn("rounded-lg border bg-white px-3 py-3 shadow-panel", className)}
    >
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div data-filter-search-first className="min-w-0 grow lg:grow-0">
          {search}
        </div>
        {children ? <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div> : null}
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto">
          {moreFilters}
          {reset}
          {saveView}
          {actions}
        </div>
      </div>
    </div>
  );
}

export function StandardSearchInput({
  value,
  onValueChange,
  onDebouncedChange,
  placeholder = "Search...",
  disabled,
  debounceMs = 300,
  className,
  ariaLabel
}: {
  value: string;
  onValueChange?: (value: string) => void;
  onDebouncedChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  debounceMs?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!onDebouncedChange) return;
    const timer = window.setTimeout(() => onDebouncedChange(draft), debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, draft, onDebouncedChange]);

  function update(next: string) {
    setDraft(next);
    if (!onDebouncedChange) onValueChange?.(next);
  }

  function clear() {
    setDraft("");
    onValueChange?.("");
    onDebouncedChange?.("");
  }

  return (
    <div className={cn("relative w-full min-w-0 sm:w-[300px]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={ariaLabel ?? placeholder}
        className="h-10 pr-9 pl-9"
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => update(event.target.value)}
      />
      {draft ? (
        <Button
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 border-0 bg-transparent p-0 text-muted-foreground hover:bg-slate-100"
          size="icon"
          variant="ghost"
          onClick={clear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function StandardSelectFilter({
  value,
  onValueChange,
  options,
  allLabel,
  placeholder,
  disabled,
  loading,
  width = "default",
  className,
  ariaLabel
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: StandardFilterOption[];
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  width?: keyof typeof filterSelectMinWidths;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <SelectField
      aria-label={ariaLabel ?? placeholder ?? allLabel ?? "Filter"}
      className={cn("h-10 max-w-full truncate", filterSelectMinWidths[width], className)}
      disabled={disabled || loading}
      value={value}
      onValueChange={onValueChange}
      title={options.find((option) => option.value === value)?.label}
    >
      {allLabel ? <option value="">{loading ? "Loading..." : allLabel}</option> : null}
      {!allLabel && placeholder ? <option value="">{loading ? "Loading..." : placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled} title={option.title ?? option.label}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}

export function StandardDateRangeFilter({
  value,
  onChange,
  disabled,
  label = "Date Range",
  className
}: {
  value: StandardDateRange;
  onChange: (value: StandardDateRange) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StandardDateRange>(value);

  useEffect(() => setDraft(value), [value.from, value.to]);

  return (
    <div className={cn("relative", className)} data-standard-date-range-filter>
      <Button
        aria-expanded={open}
        aria-label={label}
        className={cn("h-10 justify-between border bg-white px-3 text-left font-normal text-slate-700 hover:bg-slate-50", filterSelectMinWidths.dateRange)}
        disabled={disabled}
        variant="outline"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{formatDateRangeLabel(value, label)}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,560px)] rounded-lg border bg-white shadow-xl" role="dialog" aria-label={`${label} picker`}>
          <div className="grid gap-0 p-3 sm:grid-cols-[170px_1fr]">
            <div className="border-b pb-3 sm:border-b-0 sm:border-r sm:pr-3">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</p>
              <div className="grid gap-1">
                {dateRangePresets.map((preset) => (
                  <Button
                    key={preset.key}
                    className="justify-start"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const range = preset.getRange();
                      setDraft(range);
                      if (preset.key !== "custom") onChange(range);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 pt-3 sm:pl-3 sm:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Range</p>
              <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                Start date
                <Input type="date" value={draft.from ?? ""} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                End date
                <Input type="date" value={draft.to ?? ""} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 px-3 py-3">
            <Button variant="outline" size="sm" onClick={() => { setDraft({}); onChange({}); setOpen(false); }}>Clear</Button>
            <Button size="sm" onClick={() => { onChange(draft); setOpen(false); }}>Apply</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MoreFiltersSheet({
  children,
  title = "More Filters",
  description = "Fine tune this list.",
  open,
  onOpenChange,
  onReset,
  onApply,
  triggerLabel = "More Filters",
  disabled
}: {
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onReset?: () => void;
  onApply?: () => void;
  triggerLabel?: string;
  disabled?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (open === undefined) setInternalOpen(next);
  };

  return (
    <>
      <Button data-shadcn-sheet-trigger variant="outline" className="h-10 whitespace-nowrap" disabled={disabled} onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        {triggerLabel}
      </Button>
      {isOpen ? (
        <div className="fixed inset-0 z-50" data-shadcn-sheet role="dialog" aria-modal="true" aria-label={title}>
          <Button
            aria-label="Close filters"
            className="absolute inset-0 h-full w-full rounded-none border-0 bg-slate-950/30 p-0 hover:bg-slate-950/30"
            variant="ghost"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-950">{title}</h2>
                {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
              </div>
              <Button aria-label="Close filters" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">{children}</div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-slate-50 px-4 py-3">
              <Button variant="outline" size="sm" onClick={onReset}>Reset Filters</Button>
              <Button size="sm" onClick={() => { onApply?.(); setOpen(false); }}>Apply Filters</Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

export const AdvancedFiltersSheet = MoreFiltersSheet;

export function FilterSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3" data-filter-section>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function ActiveFilterChips({ chips, className }: { chips: ActiveFilterChip[]; className?: string }) {
  if (!chips.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)} data-active-filter-chips>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active filters</span>
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border bg-slate-50 px-2 text-xs font-medium text-slate-700" title={chip.title}>
          <span className="truncate">
            <span className="text-slate-500">{chip.label}:</span> {chip.value}
          </span>
          <Button aria-label={`Remove ${chip.label} filter`} className="h-5 w-5 rounded-full border-0 p-0 hover:bg-slate-200" size="icon" variant="ghost" onClick={chip.onRemove}>
            <X className="h-3 w-3" />
          </Button>
        </span>
      ))}
    </div>
  );
}

export function FilterResetButton({ onReset, disabled, label = "Reset" }: { onReset: () => void; disabled?: boolean; label?: string }) {
  return (
    <Button variant="outline" className="h-10 whitespace-nowrap" disabled={disabled} onClick={onReset}>
      {label}
    </Button>
  );
}

export function FilterToolbarActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

type SavedFilterView<T> = {
  name: string;
  value: T;
};

export function useSavedFilterViews<T>(storageKey: string) {
  const [views, setViews] = useState<Array<SavedFilterView<T>>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as Array<SavedFilterView<T>>;
    } catch {
      return [];
    }
  });

  function persist(next: Array<SavedFilterView<T>>) {
    setViews(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function saveView(name: string, value: T) {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...views.filter((view) => view.name.toLowerCase() !== trimmed.toLowerCase()), { name: trimmed, value }]);
  }

  function deleteView(name: string) {
    persist(views.filter((view) => view.name !== name));
  }

  return { views, saveView, deleteView };
}

export function SaveFilterViewButton<T>({
  storageKey,
  value,
  onApply
}: {
  storageKey: string;
  value: T;
  onApply?: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { views, saveView, deleteView } = useSavedFilterViews<T>(storageKey);

  return (
    <div className="relative">
      <Button variant="outline" className="h-10 whitespace-nowrap" onClick={() => setOpen((current) => !current)}>
        <Save className="h-4 w-4" />
        Save View
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border bg-white p-3 shadow-xl">
          <label className="grid gap-1.5 text-sm font-medium text-slate-800">
            View name
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="My payroll review" />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
            <Button size="sm" disabled={!name.trim()} onClick={() => { saveView(name, value); setName(""); }}>Save</Button>
          </div>
          {views.length ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved views</p>
              <div className="grid gap-1">
                {views.map((view) => (
                  <div key={view.name} className="flex items-center gap-2 rounded-md border bg-slate-50 px-2 py-1.5">
                    <Button className="h-7 flex-1 justify-start truncate border-0 bg-transparent px-1 text-left text-xs" variant="ghost" onClick={() => onApply?.(view.value)}>
                      <Check className="h-3.5 w-3.5" />
                      <span className="truncate">{view.name}</span>
                    </Button>
                    <Button aria-label={`Delete saved view ${view.name}`} className="h-7 w-7 border-0 p-0" variant="ghost" size="icon" onClick={() => deleteView(view.name)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const SavedFilterViewButton = SaveFilterViewButton;

export function useCascadingOrganizationFilters({
  departments,
  jobLevels,
  positions,
  departmentId,
  jobLevelId,
  onInvalidSelection
}: {
  departments: OrganizationDepartment[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
  departmentId?: string;
  jobLevelId?: string;
  onInvalidSelection?: (next: { jobLevelId?: string; positionId?: string }) => void;
}) {
  const activeDepartments = useMemo(() => departments.filter((department) => department.is_active !== false), [departments]);
  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      if (position.is_active === false) return false;
      if (departmentId && position.department_id && position.department_id !== departmentId) return false;
      if (jobLevelId && position.level_id && position.level_id !== jobLevelId) return false;
      return true;
    });
  }, [departmentId, jobLevelId, positions]);

  const filteredJobLevels = useMemo(() => {
    if (!departmentId) return jobLevels.filter((level) => level.is_active !== false);
    const allowedLevelIds = new Set(positions.filter((position) => position.department_id === departmentId && position.level_id).map((position) => position.level_id as string));
    return jobLevels.filter((level) => level.is_active !== false && (!allowedLevelIds.size || allowedLevelIds.has(level.id)));
  }, [departmentId, jobLevels, positions]);

  useEffect(() => {
    if (!jobLevelId) return;
    if (!filteredJobLevels.some((level) => level.id === jobLevelId)) onInvalidSelection?.({ jobLevelId: "", positionId: "" });
  }, [filteredJobLevels, jobLevelId, onInvalidSelection]);

  return { activeDepartments, filteredJobLevels, filteredPositions };
}
