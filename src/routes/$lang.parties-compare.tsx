import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { GitCompare, X, ArrowRight, Plus } from "lucide-react";

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
  sort_order: number;
};

type ProposalLite = {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  party_id: string | null;
  party: PartyLite | null;
  assignments: { category_id: string }[];
};

type LoaderData = {
  parties: PartyLite[];
  categories: CategoryLite[];
  proposals: ProposalLite[];
};

async function loadData(): Promise<LoaderData> {
  const [partiesRes, catsRes, propsRes] = await Promise.all([
    supabase
      .from("parties")
      .select("id, slug, name_en, name_mt, short_name, color")
      .eq("status", "published")
      .order("name_en"),
    supabase
      .from("proposal_categories")
      .select("id, slug, name_en, name_mt, sort_order")
      .order("sort_order")
      .order("name_en"),
    supabase
      .from("proposals")
      .select(
        "id, title_en, title_mt, description_en, description_mt, party_id, party:parties!inner(id, slug, name_en, name_mt, short_name, color), assignments:proposal_category_assignments(category_id)",
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

export const Route = createFileRoute("/$lang/parties-compare")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.lang)) throw notFound();
  },
  loader: () => loadData(),
  head: ({ params }) => {
    const lang = params.lang as Locale;
    const title =
      lang === "mt"
        ? "Qabbel partiti skont it-temi — Elezzjoni"
        : "Compare parties by theme — Elezzjoni";
    const desc =
      lang === "mt"
        ? "Qabbel il-proposti tal-partiti politiċi maġenb xulxin f'kull tema."
        : "Compare political parties' proposals side by side across each policy theme.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: PartiesComparePage,
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

function PartiesComparePage() {
  const { lang } = Route.useParams();
  const data = Route.useLoaderData() as LoaderData;
  const locale = lang as Locale;
  const localised = (en: string | null | undefined, mt: string | null | undefined) =>
    locale === "mt" ? (mt?.trim() || en || "") : (en || mt || "");

  const [selectedParties, setSelectedParties] = useState<string[]>(() =>
    data.parties.slice(0, Math.min(2, data.parties.length)).map((p) => p.id),
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const proposalsByPartyAndCategory = useMemo(() => {
    const map = new Map<string, Map<string, ProposalLite[]>>();
    for (const p of data.proposals) {
      if (!p.party_id) continue;
      const cats = p.assignments?.length
        ? p.assignments.map((a) => a.category_id)
        : ["__uncat__"];
      for (const cid of cats) {
        const partyMap = map.get(p.party_id) ?? new Map<string, ProposalLite[]>();
        const list = partyMap.get(cid) ?? [];
        list.push(p);
        partyMap.set(cid, list);
        map.set(p.party_id, partyMap);
      }
    }
    return map;
  }, [data.proposals]);

  // Categories present in at least one selected party (sorted by combined coverage)
  const visibleCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pid of selectedParties) {
      const m = proposalsByPartyAndCategory.get(pid);
      if (!m) continue;
      for (const [cid, list] of m.entries()) {
        if (cid === "__uncat__") continue;
        counts.set(cid, (counts.get(cid) ?? 0) + list.length);
      }
    }
    let cats = data.categories.filter((c) => counts.has(c.id));
    if (selectedCategories.length > 0) {
      cats = cats.filter((c) => selectedCategories.includes(c.id));
    }
    return cats.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  }, [proposalsByPartyAndCategory, selectedParties, selectedCategories, data.categories]);

  const partyObjects = selectedParties
    .map((id) => data.parties.find((p) => p.id === id))
    .filter((p): p is PartyLite => Boolean(p));

  const matchesQuery = (p: ProposalLite) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (p.title_en ?? "").toLowerCase().includes(q) ||
      (p.title_mt ?? "").toLowerCase().includes(q) ||
      (p.description_en ?? "").toLowerCase().includes(q) ||
      (p.description_mt ?? "").toLowerCase().includes(q)
    );
  };

  const toggleParty = (id: string) => {
    setSelectedParties((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id],
    );
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
          <GitCompare className="h-3.5 w-3.5" />{" "}
          {locale === "mt" ? "Qabbel partiti" : "Compare parties"}
        </p>
        <h1 className="mt-4 font-serif text-4xl font-bold text-foreground sm:text-5xl">
          {locale === "mt"
            ? "Qabbel x'qed jippromettu l-partiti"
            : "Compare what the parties are promising"}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {locale === "mt"
            ? "Agħżel sa erba' partiti u ara l-proposti tagħhom maġenb xulxin f'kull tema politika."
            : "Pick up to four parties and see their proposals side by side across each policy theme."}
        </p>
      </header>

      {/* Party picker */}
      <section className="mt-8 rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === "mt" ? "Partiti" : "Parties"}{" "}
          <span className="text-xs font-normal normal-case text-muted-foreground">
            ({selectedParties.length}/4)
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {data.parties.map((p) => {
            const active = selectedParties.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleParty(p.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:border-foreground/40"
                }`}
                style={
                  active && p.color
                    ? { backgroundColor: p.color, borderColor: p.color, color: "white" }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? "white" : p.color ?? "var(--muted-foreground)" }}
                />
                {p.short_name || p.name_en}
                {active && <X className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Category filter + search */}
      <section className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {locale === "mt" ? "Iffiltra temi" : "Filter themes"}
          </h2>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale === "mt" ? "Fittex proposti…" : "Search proposals…"}
            className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none sm:w-64"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategories([])}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              selectedCategories.length === 0
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:border-foreground/40"
            }`}
          >
            {locale === "mt" ? "Kollha" : "All"}
          </button>
          {data.categories.map((c) => {
            const active = selectedCategories.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCategory(c.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:border-foreground/40"
                }`}
              >
                {localised(c.name_en, c.name_mt)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Comparison grid */}
      {partyObjects.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border bg-surface p-10 text-center text-muted-foreground">
          <Plus className="mx-auto mb-2 h-6 w-6" />
          {locale === "mt" ? "Agħżel mill-inqas partit wieħed." : "Pick at least one party to begin."}
        </div>
      ) : (
        <section className="mt-8 space-y-6">
          {visibleCategories.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              {locale === "mt"
                ? "L-ebda tema għal dawn il-partiti."
                : "No themes for the selected parties."}
            </div>
          )}
          {visibleCategories.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-surface shadow-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  {localised(c.name_en, c.name_mt)}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {partyObjects
                    .map((p) => {
                      const list = (proposalsByPartyAndCategory.get(p.id)?.get(c.id) ?? []).filter(
                        matchesQuery,
                      );
                      return `${p.short_name || p.name_en}: ${list.length}`;
                    })
                    .join(" · ")}
                </span>
              </div>
              <div
                className="grid gap-px bg-border"
                style={{
                  gridTemplateColumns: `repeat(${partyObjects.length}, minmax(0, 1fr))`,
                }}
              >
                {partyObjects.map((p) => {
                  const list = (proposalsByPartyAndCategory.get(p.id)?.get(c.id) ?? []).filter(
                    matchesQuery,
                  );
                  return (
                    <div key={p.id} className="bg-surface p-3">
                      <div
                        className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                        style={{ color: p.color ?? undefined }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }}
                        />
                        {p.short_name || p.name_en}
                        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {list.length}
                        </span>
                      </div>
                      {list.length === 0 ? (
                        <p className="py-4 text-center text-xs italic text-muted-foreground">
                          {locale === "mt" ? "Xejn." : "Nothing here."}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {list.slice(0, 12).map((pr) => (
                            <li
                              key={pr.id}
                              className="rounded-md border border-border bg-background p-2 text-xs"
                            >
                              <div className="font-medium text-foreground">
                                {localised(pr.title_en, pr.title_mt)}
                              </div>
                              {(pr.description_en || pr.description_mt) && (
                                <p className="mt-1 line-clamp-3 text-muted-foreground">
                                  {localised(pr.description_en, pr.description_mt)}
                                </p>
                              )}
                            </li>
                          ))}
                          {list.length > 12 && (
                            <li className="text-center text-[11px] text-muted-foreground">
                              +{list.length - 12} {locale === "mt" ? "oħra" : "more"}
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="mt-12 flex justify-center gap-3">
        <Link
          to="/$lang/themes"
          params={{ lang }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          {locale === "mt" ? "Mappa tat-temi" : "Theme map"} <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/$lang/proposals"
          params={{ lang }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          {locale === "mt" ? "Il-proposti kollha" : "All proposals"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
