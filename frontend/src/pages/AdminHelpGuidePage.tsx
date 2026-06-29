import { Check, Copy, ExternalLink, Hash, ListChecks, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ActiveFilterChips, FilterResetButton, StandardFilterBar, StandardSearchInput } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { InfoPanel, PageHeader, PageShell, PermissionDeniedState, SectionCard, WarningPanel } from "../components/ui/page-shell";
import { APP_BRANDING } from "../config/branding";
import { canAccessAdminHelp } from "../features/admin-help/AdminHelpLink";
import { guideSearchKeywords, guideSections, type GuideBlock, type GuideSection } from "../features/admin-help/hrmGuideContent";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";

function getBlockText(block: GuideBlock) {
  if (block.type === "paragraph") return block.text;
  if (block.type === "callout") return `${block.title} ${block.text}`;
  return `${"title" in block ? block.title : ""} ${block.items.join(" ")}`;
}

function sectionMatches(section: GuideSection, query: string) {
  if (!query) return true;
  const haystack = [
    section.id,
    section.title,
    section.navTitle ?? "",
    ...section.keywords,
    ...(section.aliases ?? []),
    ...(section.relatedRoutes?.map((route) => route.label) ?? []),
    ...section.blocks.map(getBlockText)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function checklistText(title: string, items: string[]) {
  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

function GuideCallout({ block }: { block: Extract<GuideBlock, { type: "callout" }> }) {
  const tone = block.tone === "warning" ? "warning" : block.tone === "success" ? "success" : "info";
  return (
    <WarningPanel tone={tone}>
      <div className="font-semibold">{block.title}</div>
      <div className="mt-1 leading-6">{block.text}</div>
    </WarningPanel>
  );
}

function GuideChecklist({ block, sectionId, index }: { block: Extract<GuideBlock, { type: "checklist" }>; sectionId: string; index: number }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const key = `${sectionId}-${index}`;
  const copied = copiedKey === key;
  const unavailable = copiedKey === `${key}-unavailable`;

  async function copyChecklist() {
    if (!navigator.clipboard) {
      setCopiedKey(`${key}-unavailable`);
      window.setTimeout(() => setCopiedKey(null), 1800);
      return;
    }

    await navigator.clipboard.writeText(checklistText(block.title, block.items));
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-slate-50/70">
      <div className="flex flex-col gap-2 border-b bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-semibold text-slate-950">{block.title}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={copyChecklist}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : unavailable ? "Unavailable" : "Copy"}
        </Button>
      </div>
      <ul className="grid gap-2 p-3 text-sm text-slate-700">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2 leading-6">
            <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuideBlockView({ block, sectionId, index }: { block: GuideBlock; sectionId: string; index: number }) {
  if (block.type === "paragraph") {
    return <p className="text-sm leading-7 text-slate-700">{block.text}</p>;
  }

  if (block.type === "list") {
    return (
      <ul className="grid gap-2 text-sm text-slate-700">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2 leading-6">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "steps") {
    return (
      <ol className="grid gap-2 text-sm text-slate-700">
        {block.items.map((item, stepIndex) => (
          <li key={item} className="flex gap-3 leading-6">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-white text-xs font-semibold text-slate-600">{stepIndex + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "checklist") {
    return <GuideChecklist block={block} sectionId={sectionId} index={index} />;
  }

  return <GuideCallout block={block} />;
}

export function AdminHelpGuidePage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const canView = canAccessAdminHelp(user);
  const normalizedQuery = query.trim();

  const visibleSections = useMemo(
    () => guideSections.filter((section) => sectionMatches(section, normalizedQuery)),
    [normalizedQuery]
  );
  const activeFilterChips = useMemo(() => normalizedQuery ? [{ key: "query", label: "Search", value: normalizedQuery, onRemove: () => setQuery("") }] : [], [normalizedQuery]);

  if (!canView) {
    return (
      <PageShell>
        <PermissionDeniedState />
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title={`${APP_BRANDING.appName} Advanced Configuration & Operations Guide`}
        description={`Super Admin guide for configuring and operating ${APP_BRANDING.appName} across people, documents, leave, attendance, roster, payroll, approvals, reports, and production controls.`}
        eyebrow="Super Admin Guide"
        actions={
          <>
            <Badge tone="info">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              admin.help.view
            </Badge>
            <Badge tone="neutral">Static guide</Badge>
          </>
        }
      />

      <InfoPanel>
        This guide is local in-app documentation. It does not introduce assistant, chat, or external intelligence features, and it does not change backend business behavior.
      </InfoPanel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <SectionCard title="Guide Navigation" description={`${visibleSections.length} of ${guideSections.length} sections`} bodyClassName="space-y-3 p-3">
            <StandardFilterBar
              search={<StandardSearchInput value={query} onDebouncedChange={setQuery} placeholder="Search guide..." ariaLabel="Search guide" />}
              reset={<FilterResetButton onReset={() => setQuery("")} />}
            />
            <ActiveFilterChips chips={activeFilterChips} />
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Search covers section titles, checklist text, aliases, and keywords such as {guideSearchKeywords.slice(0, 4).join(", ")}.
            </div>
            <nav className="max-h-[calc(100vh-16rem)] space-y-1 overflow-y-auto pr-1">
              {visibleSections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-950"
                >
                  <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{section.navTitle ?? section.title}</span>
                </a>
              ))}
            </nav>
          </SectionCard>
        </aside>

        <main className="min-w-0 space-y-4">
          {visibleSections.length === 0 ? (
            <SectionCard title="No guide results">
              <p className="text-sm text-muted-foreground">No guide sections match your search. Try a module name such as leave, payroll, ZKTeco, contracts, reports, cache, or deployment.</p>
            </SectionCard>
          ) : null}

          {visibleSections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-4">
              {section.aliases?.map((alias) => (
                <span key={alias} id={alias} className="block scroll-mt-4" />
              ))}
              <SectionCard
                title={
                  <span className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    {section.title}
                  </span>
                }
                description={section.keywords.slice(0, 7).join(" / ")}
                actions={
                  section.relatedRoutes?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {section.relatedRoutes.map((route) => (
                        <Link key={`${section.id}-${route.to}`} to={route.to}>
                          <Button variant="outline" size="sm">
                            <ExternalLink className="h-4 w-4" />
                            {route.label}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  ) : null
                }
                bodyClassName="space-y-4"
              >
                <div className="flex flex-wrap gap-2">
                  {section.keywords.slice(0, 5).map((keyword) => (
                    <Badge key={`${section.id}-${keyword}`} tone="neutral">{keyword}</Badge>
                  ))}
                </div>
                <div className={cn("grid gap-4", section.blocks.length > 4 && "xl:grid-cols-2")}>
                  {section.blocks.map((block, index) => (
                    <GuideBlockView key={`${section.id}-${index}`} block={block} sectionId={section.id} index={index} />
                  ))}
                </div>
              </SectionCard>
            </section>
          ))}
        </main>
      </div>
    </PageShell>
  );
}
