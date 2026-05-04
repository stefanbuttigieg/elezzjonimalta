import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";
import { Network, Tag, ArrowRight } from "lucide-react";

type PartyLite = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
};

type CategoryLite = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  description_en: string | null;
  sort_order: number;
};

type ProposalLite = {
  id: string;
  title_en: string;
  title_mt: string | null;
  party: PartyLite | null;
  assignments: { category_id: string }[];
};

type LoaderData = {
  parties: PartyLite[];
  categories: CategoryLite[];
  proposals: ProposalLite[];
};

async function loadGraph(): Promise<LoaderData> {
  const [partiesRes, catsRes, propsRes] = await Promise.all([
    supabase
      .from("parties")
      .select("id, slug, name_en, name_mt, short_name, color")
      .eq("status", "published")
      .order("name_en"),
    supabase
      .from("proposal_categories")
      .select("id, slug, name_en, name_mt, description_en, sort_order")
      .order("sort_order")
      .order("name_en"),
    supabase
      .from("proposals")
      .select(
        "id, title_en, title_mt, party:parties!inner(id, slug, name_en, name_mt, short_name, color), assignments:proposal_category_assignments(category_id)",
      )
      .eq("status", "published")
      .is("merged_into_id", null)
      .not("party_id", "is", null),
  ]);

  if (partiesRes.error) throw new Error(partiesRes.error.message);
  if (catsRes.error) throw new Error(catsRes.error.message);
  if (propsRes.error) throw new Error(propsRes.error.message);

  return {
    parties: (partiesRes.data ?? []) as PartyLite[],
    categories: (catsRes.data ?? []) as CategoryLite[],
    proposals: (propsRes.data ?? []) as unknown as ProposalLite[],
  };
}

export const Route = createFileRoute("/$lang/themes")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.lang)) throw notFound();
  },
  loader: () => loadGraph(),
  head: ({ params }) => {
    const lang = params.lang as Locale;
    const title =
      lang === "mt"
        ? "Temi politiċi — Elezzjoni"
        : "Policy themes — Elezzjoni";
    const desc =
      lang === "mt"
        ? "Ara liema partiti qed jippromettu x'hiex f'kull tema politika."
        : "Explore which parties are promising what across every policy theme.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: ThemesPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
    </div>
  ),
});

function ThemesPage() {
  const { lang } = Route.useParams();
  const data = Route.useLoaderData() as LoaderData;
  const t = useT();
  const locale = lang as Locale;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeParty, setActiveParty] = useState<string | null>(null);

  const localised = (en: string | null | undefined, mt: string | null | undefined) =>
    locale === "mt" ? (mt?.trim() || en || "") : (en || mt || "");

  // Build party x category matrix of counts
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    const partyTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();
    for (const p of data.proposals) {
      if (!p.party) continue;
      const partyId = p.party.id;
      partyTotals.set(partyId, (partyTotals.get(partyId) ?? 0) + 1);
      const cats = p.assignments?.length ? p.assignments.map((a) => a.category_id) : ["__uncat__"];
      for (const cid of cats) {
        if (cid === "__uncat__") continue;
        categoryTotals.set(cid, (categoryTotals.get(cid) ?? 0) + 1);
        const row = m.get(partyId) ?? new Map<string, number>();
        row.set(cid, (row.get(cid) ?? 0) + 1);
        m.set(partyId, row);
      }
    }
    return { m, partyTotals, categoryTotals };
  }, [data.proposals]);

  const maxCell = useMemo(() => {
    let max = 0;
    for (const row of matrix.m.values()) {
      for (const v of row.values()) if (v > max) max = v;
    }
    return max || 1;
  }, [matrix]);

  const orderedCategories = useMemo(
    () =>
      [...data.categories].sort(
        (a, b) => (matrix.categoryTotals.get(b.id) ?? 0) - (matrix.categoryTotals.get(a.id) ?? 0),
      ),
    [data.categories, matrix],
  );

  const orderedParties = useMemo(
    () =>
      [...data.parties].sort(
        (a, b) => (matrix.partyTotals.get(b.id) ?? 0) - (matrix.partyTotals.get(a.id) ?? 0),
      ),
    [data.parties, matrix],
  );

  const filteredProposals = useMemo(() => {
    return data.proposals.filter((p) => {
      if (activeParty && p.party?.id !== activeParty) return false;
      if (activeCategory) {
        const cats = new Set(p.assignments?.map((a) => a.category_id) ?? []);
        if (!cats.has(activeCategory)) return false;
      }
      return true;
    });
  }, [data.proposals, activeParty, activeCategory]);

  const totalProposals = data.proposals.length;
  const totalCategorised = data.proposals.filter((p) => (p.assignments?.length ?? 0) > 0).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
          <Network className="h-3.5 w-3.5" /> {locale === "mt" ? "Mappa tat-temi" : "Theme map"}
        </p>
        <h1 className="mt-4 font-serif text-4xl font-bold text-foreground sm:text-5xl">
          {locale === "mt" ? "X'qed jippromettu l-partiti?" : "What are the parties promising?"}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {locale === "mt"
            ? "Esplora kif kull partit jaqsam il-proposti tiegħu fost it-temi politiċi prinċipali."
            : "Explore how each party distributes their published proposals across the major policy themes."}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{totalProposals}</strong> {locale === "mt" ? "proposti" : "proposals"}</span>
          <span><strong className="text-foreground">{totalCategorised}</strong> {locale === "mt" ? "ikkategorizzati" : "categorised"}</span>
          <span><strong className="text-foreground">{data.categories.length}</strong> {locale === "mt" ? "temi" : "themes"}</span>
          <span><strong className="text-foreground">{data.parties.length}</strong> {locale === "mt" ? "partiti" : "parties"}</span>
        </div>
      </header>

      {/* Heatmap matrix */}
      <section className="mt-10 overflow-x-auto rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === "mt" ? "Matrici partiti × temi" : "Parties × themes matrix"}
        </h2>
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface text-left font-semibold text-muted-foreground">
                {locale === "mt" ? "Partit" : "Party"}
              </th>
              {orderedCategories.map((c) => (
                <th
                  key={c.id}
                  className="cursor-pointer px-1 text-left font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
                  title={localised(c.description_en, null) || ""}
                >
                  <div className="max-w-[80px] truncate">{localised(c.name_en, c.name_mt)}</div>
                </th>
              ))}
              <th className="px-2 text-right font-semibold text-muted-foreground">Σ</th>
            </tr>
          </thead>
          <tbody>
            {orderedParties.map((p) => {
              const row = matrix.m.get(p.id);
              const total = matrix.partyTotals.get(p.id) ?? 0;
              return (
                <tr key={p.id}>
                  <th
                    className="sticky left-0 bg-surface text-left font-semibold cursor-pointer hover:underline"
                    onClick={() => setActiveParty(activeParty === p.id ? null : p.id)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }} />
                      {p.short_name || p.name_en}
                    </span>
                  </th>
                  {orderedCategories.map((c) => {
                    const v = row?.get(c.id) ?? 0;
                    const intensity = v / maxCell;
                    const bg = v === 0
                      ? "transparent"
                      : `color-mix(in oklab, ${p.color ?? "hsl(var(--primary))"} ${Math.round(15 + intensity * 75)}%, transparent)`;
                    const isActive = activeCategory === c.id || activeParty === p.id;
                    return (
                      <td
                        key={c.id}
                        className={`cursor-pointer rounded text-center font-medium transition-all ${isActive ? "ring-2 ring-foreground/30" : ""}`}
                        style={{ backgroundColor: bg, color: v > 0 && intensity > 0.5 ? "white" : undefined, minWidth: 32, height: 28 }}
                        onClick={() => {
                          setActiveCategory(c.id);
                          setActiveParty(p.id);
                        }}
                        title={`${p.short_name || p.name_en} · ${localised(c.name_en, c.name_mt)}: ${v}`}
                      >
                        {v || ""}
                      </td>
                    );
                  })}
                  <td className="px-2 text-right font-semibold text-foreground">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          {locale === "mt"
            ? "Ikklikkja ċellola, partit jew tema biex tiffiltra l-lista hawn taħt."
            : "Click any cell, party, or theme to filter the list below."}
        </p>
      </section>

      {/* Theme cards */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === "mt" ? "Temi" : "Themes"}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderedCategories.map((c) => {
            const total = matrix.categoryTotals.get(c.id) ?? 0;
            const partyBreakdown = orderedParties
              .map((p) => ({ p, count: matrix.m.get(p.id)?.get(c.id) ?? 0 }))
              .filter((x) => x.count > 0)
              .sort((a, b) => b.count - a.count);
            const max = partyBreakdown[0]?.count ?? 1;
            const isActive = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(isActive ? null : c.id)}
                className={`group rounded-xl border p-4 text-left transition-all hover:border-foreground/30 hover:shadow-md ${isActive ? "border-foreground/40 bg-accent/40" : "border-border bg-surface"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-2 font-semibold text-foreground">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {localised(c.name_en, c.name_mt)}
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{total}</span>
                </div>
                {c.description_en && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description_en}</p>
                )}
                <div className="mt-3 space-y-1.5">
                  {partyBreakdown.slice(0, 4).map(({ p, count }) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 truncate font-medium" style={{ color: p.color ?? undefined }}>
                        {p.short_name || p.name_en}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(count / max) * 100}%`, backgroundColor: p.color ?? "hsl(var(--primary))" }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  ))}
                  {partyBreakdown.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {locale === "mt" ? "L-ebda partit għadu ma ppromettja f'din it-tema." : "No party has promised in this theme yet."}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filtered proposals list */}
      {(activeCategory || activeParty) && (
        <section className="mt-10 rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold">{filteredProposals.length}</span>{" "}
              <span className="text-muted-foreground">
                {locale === "mt" ? "proposti jaqblu" : "matching proposals"}
              </span>
              {activeParty && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {orderedParties.find((p) => p.id === activeParty)?.short_name ?? "Party"}
                  <button onClick={() => setActiveParty(null)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                </span>
              )}
              {activeCategory && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {localised(
                    orderedCategories.find((c) => c.id === activeCategory)?.name_en ?? "",
                    orderedCategories.find((c) => c.id === activeCategory)?.name_mt ?? null,
                  )}
                  <button onClick={() => setActiveCategory(null)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setActiveCategory(null);
                setActiveParty(null);
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              {locale === "mt" ? "Aġġorna" : "Clear filters"}
            </button>
          </div>
          <ul className="divide-y divide-border">
            {filteredProposals.slice(0, 50).map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2.5">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.party?.color ?? "var(--muted-foreground)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: p.party?.color ?? undefined }}>
                    {p.party?.short_name || p.party?.name_en}
                  </div>
                  <div className="text-sm text-foreground">{localised(p.title_en, p.title_mt)}</div>
                </div>
              </li>
            ))}
            {filteredProposals.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                {locale === "mt" ? "L-ebda proposta ma taqbel." : "No proposals match this filter."}
              </li>
            )}
          </ul>
          {filteredProposals.length > 50 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {locale === "mt"
                ? `Qed turi 50 minn ${filteredProposals.length}.`
                : `Showing 50 of ${filteredProposals.length}.`}
            </p>
          )}
        </section>
      )}

      <div className="mt-12 flex justify-center">
        <Link
          to="/$lang/proposals"
          params={{ lang }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          {t("proposals.meta.title").replace(" — Elezzjoni", "")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
