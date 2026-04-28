import {
  createFileRoute,
  ErrorComponent,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search, UserRound, Flag, FileText, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";

type Kind = "candidate" | "party" | "manifesto" | "proposal";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  type: fallback(z.enum(["all", "candidates", "parties", "manifestos", "proposals"]), "all").default("all"),
});

type SearchResult = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  href: string;
  hrefParams?: Record<string, string>;
  accent?: string | null;
};

function pick(en: string | null | undefined, mt: string | null | undefined, locale: Locale): string {
  if (locale === "mt") return (mt && mt.trim()) || en || "";
  return en || mt || "";
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function runSearch(q: string, locale: Locale): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${escapeLike(term)}%`;

  const [candRes, partyRes, propRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, slug, full_name, bio_en, bio_mt, status, is_incumbent, party:parties(slug, name_en, name_mt, short_name, color)",
      )
      .or(`full_name.ilike.${like},bio_en.ilike.${like},bio_mt.ilike.${like}`)
      .or("status.eq.published,is_incumbent.eq.true")
      .limit(40),
    supabase
      .from("parties")
      .select(
        "id, slug, name_en, name_mt, short_name, color, description_en, description_mt, slogan_en, slogan_mt",
      )
      .eq("status", "published")
      .or(
        `name_en.ilike.${like},name_mt.ilike.${like},short_name.ilike.${like},description_en.ilike.${like},description_mt.ilike.${like},slogan_en.ilike.${like},slogan_mt.ilike.${like}`,
      )
      .limit(40),
    supabase
      .from("proposals")
      .select(
        "id, title_en, title_mt, description_en, description_mt, category, candidate:candidates(slug, full_name), party:parties(slug, name_en, name_mt, short_name, color)",
      )
      .eq("status", "published")
      .or(
        `title_en.ilike.${like},title_mt.ilike.${like},description_en.ilike.${like},description_mt.ilike.${like},category.ilike.${like}`,
      )
      .limit(40),
  ]);

  const results: SearchResult[] = [];

  for (const c of candRes.data ?? []) {
    const party = (c as any).party;
    results.push({
      id: `cand-${c.id}`,
      kind: "candidate",
      title: c.full_name,
      subtitle: party ? pick(party.name_en, party.name_mt, locale) : null,
      snippet: pick(c.bio_en, c.bio_mt, locale)?.slice(0, 220) || null,
      href: "/$lang/candidates",
      accent: party?.color ?? null,
    });
  }

  for (const p of partyRes.data ?? []) {
    const name = pick(p.name_en, p.name_mt, locale);
    const slogan = pick(p.slogan_en, p.slogan_mt, locale);
    const desc = pick(p.description_en, p.description_mt, locale);
    results.push({
      id: `party-${p.id}`,
      kind: "party",
      title: name,
      subtitle: p.short_name ?? null,
      snippet: slogan || desc?.slice(0, 220) || null,
      href: "/$lang/parties/$slug",
      hrefParams: { slug: p.slug },
      accent: p.color ?? null,
    });
    // Manifesto-style entry from party description
    if (desc && desc.trim().length > 0) {
      results.push({
        id: `manifesto-${p.id}`,
        kind: "manifesto",
        title: `${name} — Manifesto`,
        subtitle: slogan || null,
        snippet: desc.slice(0, 240),
        href: "/$lang/parties/$slug",
        hrefParams: { slug: p.slug },
        accent: p.color ?? null,
      });
    }
  }

  for (const pr of propRes.data ?? []) {
    const party = (pr as any).party;
    const candidate = (pr as any).candidate;
    const subtitleParts: string[] = [];
    if (pr.category) subtitleParts.push(pr.category);
    if (party) subtitleParts.push(pick(party.name_en, party.name_mt, locale));
    else if (candidate) subtitleParts.push(candidate.full_name);
    results.push({
      id: `prop-${pr.id}`,
      kind: "proposal",
      title: pick(pr.title_en, pr.title_mt, locale),
      subtitle: subtitleParts.join(" · ") || null,
      snippet: pick(pr.description_en, pr.description_mt, locale)?.slice(0, 240) || null,
      href: "/$lang/proposals",
      accent: party?.color ?? null,
    });
  }

  // Rank: title matches first
  const lower = term.toLowerCase();
  results.sort((a, b) => {
    const aT = a.title.toLowerCase().includes(lower) ? 0 : 1;
    const bT = b.title.toLowerCase().includes(lower) ? 0 : 1;
    return aT - bT;
  });

  return results;
}

export const Route = createFileRoute("/$lang/search")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ params, deps }) => {
    const locale: Locale = isLocale(params.lang) ? params.lang : "en";
    const results = await runSearch(deps.q, locale);
    return { results };
  },
  head: ({ params }) => {
    const locale: Locale = isLocale(params.lang) ? params.lang : "en";
    const title = locale === "mt" ? "Fittex — Vot Malta 2026" : "Search — Vot Malta 2026";
    const description =
      locale === "mt"
        ? "Fittex kandidati, partiti, manifesti u proposti."
        : "Search candidates, parties, manifestos and proposals.";
    return { meta: [{ title }, { name: "description", content: description }] };
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <ErrorComponent error={error} />
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold"
        >
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => <div>Not found</div>,
  component: SearchPage,
});

const KIND_ICON: Record<Kind, typeof UserRound> = {
  candidate: UserRound,
  party: Flag,
  manifesto: BookOpen,
  proposal: FileText,
};

function SearchPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/$lang/search" });
  const { results } = Route.useLoaderData() as { results: SearchResult[] };

  const filtered = results.filter((r: SearchResult) => {
    if (search.type === "all") return true;
    if (search.type === "candidates") return r.kind === "candidate";
    if (search.type === "parties") return r.kind === "party";
    if (search.type === "manifestos") return r.kind === "manifesto";
    if (search.type === "proposals") return r.kind === "proposal";
    return true;
  });

  const groups: Array<{ kind: Kind; labelKey: string; items: SearchResult[] }> = [
    { kind: "candidate", labelKey: "search.group.candidates", items: filtered.filter((r: SearchResult) => r.kind === "candidate") },
    { kind: "party", labelKey: "search.group.parties", items: filtered.filter((r: SearchResult) => r.kind === "party") },
    { kind: "manifesto", labelKey: "search.group.manifestos", items: filtered.filter((r: SearchResult) => r.kind === "manifesto") },
    { kind: "proposal", labelKey: "search.group.proposals", items: filtered.filter((r: SearchResult) => r.kind === "proposal") },
  ];

  const updateSearch = (patch: Partial<typeof search>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  const filterTabs: Array<{ value: typeof search.type; labelKey: string }> = [
    { value: "all", labelKey: "search.filter.all" },
    { value: "candidates", labelKey: "search.filter.candidates" },
    { value: "parties", labelKey: "search.filter.parties" },
    { value: "manifestos", labelKey: "search.filter.manifestos" },
    { value: "proposals", labelKey: "search.filter.proposals" },
  ];

  const trimmed = search.q.trim();

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("search.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("search.subtitle")}
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-surface p-4 shadow-card">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("search.title")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(e) => updateSearch({ q: e.target.value })}
                placeholder={t("search.placeholder")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </span>
          </label>

          <div className="mt-3 flex flex-wrap gap-1">
            {filterTabs.map((tab) => {
              const active = search.type === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => updateSearch({ type: tab.value })}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground/80 hover:bg-accent")
                  }
                >
                  {t(tab.labelKey as any)}
                </button>
              );
            })}
          </div>
        </div>

        {trimmed.length < 2 ? (
          <EmptyState
            icon={Search}
            title={t("search.prompt.title")}
            body={t("search.prompt.body")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("search.empty.title")}
            body={t("search.empty.body")}
          />
        ) : (
          <>
            <div className="mt-6 text-sm text-muted-foreground">
              {t("search.results", { count: filtered.length })}
            </div>
            <div className="mt-4 space-y-8">
              {groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.kind}>
                    <h2 className="mb-3 font-serif text-xl font-bold text-foreground">
                      {t(g.labelKey as any)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        ({g.items.length})
                      </span>
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {g.items.map((item) => (
                        <ResultCard key={item.id} item={item} locale={locale} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Search;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 font-serif text-2xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ResultCard({
  item,
  locale,
  t,
}: {
  item: SearchResult;
  locale: Locale;
  t: ReturnType<typeof useT>;
}) {
  const Icon = KIND_ICON[item.kind];
  const kindLabel = t(`search.kind.${item.kind}` as any);

  const linkProps: any = item.hrefParams
    ? { to: item.href, params: { lang: locale, ...item.hrefParams } }
    : { to: item.href, params: { lang: locale } };

  return (
    <Link
      {...linkProps}
      className="group block rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background"
          style={item.accent ? { borderColor: item.accent } : undefined}
        >
          <Icon className="h-4 w-4 text-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {kindLabel}
            </span>
            {item.subtitle ? (
              <span className="truncate text-xs text-muted-foreground">· {item.subtitle}</span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate font-serif text-lg font-bold text-foreground group-hover:text-primary">
            {item.title}
          </h3>
          {item.snippet ? (
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {item.snippet}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
