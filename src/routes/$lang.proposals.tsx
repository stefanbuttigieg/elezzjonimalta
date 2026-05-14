import {
  createFileRoute,
  ErrorComponent,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { ExternalLink, Filter, FileText, History, Landmark, Link2, RotateCcw, Search, Sparkles, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { formatUpdatedAt } from "@/lib/formatDate";
import { proposalSimilarity, type ProposalForMatch } from "@/lib/proposal-dedupe";

const proposalSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  scope: fallback(z.enum(["all", "party", "candidate"]), "all").default("all"),
  party: fallback(z.string(), "all").default("all"),
  candidate: fallback(z.string(), "all").default("all"),
  category: fallback(z.string(), "all").default("all"),
});

type PartyOption = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
};

type CandidateOption = {
  id: string;
  slug: string;
  full_name: string;
};

type ProposalRecord = {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  source_url: string | null;
  updated_at: string;
  party: PartyOption | null;
  candidate: CandidateOption | null;
};

async function loadProposals({
  q,
  scope,
  party,
  candidate,
  category,
}: {
  q: string;
  scope: "all" | "party" | "candidate";
  party: string;
  candidate: string;
  category: string;
}) {
  const cleanQuery = q.trim();
  let proposalsQuery = supabase
    .from("proposals")
    .select(
      "id, title_en, title_mt, description_en, description_mt, category, source_url, updated_at, party:parties(id, slug, name_en, name_mt, short_name, color), candidate:candidates(id, slug, full_name)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (cleanQuery) {
    proposalsQuery = proposalsQuery.or(
      `title_en.ilike.%${cleanQuery}%,title_mt.ilike.%${cleanQuery}%`,
    );
  }
  if (scope === "party") proposalsQuery = proposalsQuery.not("party_id", "is", null);
  if (scope === "candidate") proposalsQuery = proposalsQuery.not("candidate_id", "is", null);
  if (party !== "all") proposalsQuery = proposalsQuery.eq("party_id", party);
  if (candidate !== "all") proposalsQuery = proposalsQuery.eq("candidate_id", candidate);
  if (category !== "all") proposalsQuery = proposalsQuery.eq("category", category);

  const [proposalsResult, partiesResult, candidatesResult, categoriesResult, indexResult] = await Promise.all([
    proposalsQuery,
    supabase
      .from("parties")
      .select("id, slug, name_en, name_mt, short_name, color")
      .eq("status", "published")
      .order("name_en", { ascending: true }),
    supabase
      .from("candidates")
      .select("id, slug, full_name")
      .eq("status", "published")
      .order("full_name", { ascending: true }),
    supabase
      .from("proposals")
      .select("category")
      .eq("status", "published")
      .not("category", "is", null),
    supabase
      .from("proposals")
      .select("id, title_en, title_mt, description_en, description_mt, party_id, candidate_id, status, category, party:parties(id, slug, name_en, name_mt, short_name, color), candidate:candidates(id, slug, full_name)")
      .eq("status", "published")
      .is("merged_into_id", null)
      .limit(2000),
  ]);

  if (proposalsResult.error) throw proposalsResult.error;
  if (partiesResult.error) throw partiesResult.error;
  if (candidatesResult.error) throw candidatesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (indexResult.error) throw indexResult.error;

  const categories = Array.from(
    new Set(((categoriesResult.data ?? []) as { category: string | null }[])
      .map((row) => row.category)
      .filter((cat): cat is string => Boolean(cat))),
  ).sort();

  return {
    proposals: (proposalsResult.data ?? []) as ProposalRecord[],
    parties: (partiesResult.data ?? []) as PartyOption[],
    candidates: (candidatesResult.data ?? []) as CandidateOption[],
    categories,
    indexPool: (indexResult.data ?? []) as IndexProposal[],
  };
}

type IndexProposal = ProposalForMatch & {
  category: string | null;
  party: PartyOption | null;
  candidate: CandidateOption | null;
};

export const Route = createFileRoute("/$lang/proposals")({
  validateSearch: zodValidator(proposalSearchSchema),
  loaderDeps: ({ search: { q, scope, party, candidate, category } }) => ({
    q,
    scope,
    party,
    candidate,
    category,
  }),
  loader: ({ deps }) => loadProposals(deps),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "proposals.meta.title");
    const description = translate(lang, "proposals.meta.description");
    const url = `https://elezzjoni.app/${lang}/proposals`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: ProposalsError,
  notFoundComponent: () => <ProposalsNotFound />,
  component: ProposalsPage,
});

function ProposalsPage() {
  const t = useT();
  const navigate = useNavigate({ from: "/$lang/proposals" });
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const { proposals, parties, candidates, categories, indexPool } = Route.useLoaderData();
  const locale = isLocale(lang) ? lang : "en";

  const relatedIndex = useMemo(() => {
    const map = new Map<string, { proposal: IndexProposal; score: number }[]>();
    for (const target of proposals as ProposalRecord[]) {
      const matches = (indexPool as IndexProposal[])
        .filter((p: IndexProposal) => p.id !== target.id)
        .map((p: IndexProposal) => ({ proposal: p, score: proposalSimilarity(target as unknown as ProposalForMatch, p) }))
        .filter((m: { proposal: IndexProposal; score: number }) => m.score >= 0.18)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (matches.length > 0) map.set(target.id, matches);
    }
    return map;
  }, [proposals, indexPool]);

  const updateSearch = (patch: Partial<typeof search>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("proposals.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("proposals.subtitle")}
          </p>
          <Link
            to="/$lang/community-proposals"
            params={{ lang: locale }}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {locale === "mt" ? "Ara wkoll: Proposti mill-Komunità →" : "See also: Proposals from the Community →"}
          </Link>
        </div>

        <div className="mt-8 grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("candidates.search.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(event) => updateSearch({ q: event.target.value })}
                placeholder={t("proposals.search.placeholder")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>

          <FilterSelect
            label={t("proposals.filter.scope.label")}
            value={search.scope}
            onChange={(value) =>
              updateSearch({ scope: value as "all" | "party" | "candidate" })
            }
            options={[
              { value: "party", label: t("proposals.filter.scope.party") },
              { value: "candidate", label: t("proposals.filter.scope.candidate") },
            ]}
            allLabel={t("proposals.filter.scope.all")}
          />

          <FilterSelect
            label={t("proposals.filter.party.label")}
            value={search.party}
            onChange={(value) => updateSearch({ party: value })}
            options={parties.map((p: PartyOption) => ({
              value: p.id,
              label: partyName(p, locale),
            }))}
            allLabel={t("proposals.filter.party.all")}
          />

          <FilterSelect
            label={t("proposals.filter.category.label")}
            value={search.category}
            onChange={(value) => updateSearch({ category: value })}
            options={categories.map((c: string) => ({ value: c, label: c }))}
            allLabel={t("proposals.filter.category.all")}
          />

          <Link
            to="/$lang/proposals"
            params={{ lang: locale }}
            search={{ q: "", scope: "all", party: "all", candidate: "all", category: "all" }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            {t("candidates.filters.reset")}
          </Link>
        </div>

        {candidates.length > 0 ? (
          <div className="mt-3">
            <FilterSelect
              label={t("proposals.filter.candidate.label")}
              value={search.candidate}
              onChange={(value) => updateSearch({ candidate: value })}
              options={candidates.map((c: CandidateOption) => ({
                value: c.id,
                label: c.full_name,
              }))}
              allLabel={t("proposals.filter.candidate.all")}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <p>{t("proposals.results", { count: proposals.length })}</p>
          {proposals.length > 0 ? (
            <p className="inline-flex items-center gap-1 text-[11px]">
              <History className="h-3 w-3" />
              {locale === "mt" ? "L-aħħar aġġornament" : "Last update"}:{" "}
              {formatUpdatedAt(
                proposals.reduce(
                  (a: string, b: ProposalRecord) => (a > b.updated_at ? a : b.updated_at),
                  proposals[0].updated_at,
                ),
                locale,
              )}
            </p>
          ) : null}
        </div>

        {proposals.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {proposals.map((proposal: ProposalRecord) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                locale={locale}
                related={relatedIndex.get(proposal.id) ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-serif text-2xl font-bold text-foreground">
              {t("proposals.empty.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("proposals.empty.body")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm text-foreground outline-none"
        >
          <option value="all">{allLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function ProposalCard({
  proposal,
  locale,
  related,
}: {
  proposal: ProposalRecord;
  locale: Locale;
  related: { proposal: IndexProposal; score: number }[];
}) {
  const t = useT();
  const [showRelated, setShowRelated] = useState(false);
  const title =
    locale === "mt"
      ? proposal.title_mt || proposal.title_en
      : proposal.title_en || proposal.title_mt;
  const description =
    locale === "mt"
      ? proposal.description_mt || proposal.description_en
      : proposal.description_en || proposal.description_mt;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {proposal.party ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground"
            title={t("proposals.from.party")}
          >
            {proposal.party.color ? (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: proposal.party.color }}
              />
            ) : (
              <Landmark className="h-3.5 w-3.5" />
            )}
            {partyName(proposal.party, locale)}
          </span>
        ) : null}
        {proposal.candidate ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground"
            title={t("proposals.from.candidate")}
          >
            <UserRound className="h-3.5 w-3.5" />
            {proposal.candidate.full_name}
          </span>
        ) : null}
        {proposal.category ? (
          <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            {proposal.category}
          </span>
        ) : null}
      </div>

      <h2 className="mt-3 font-serif text-xl font-bold leading-tight text-foreground">
        {title}
      </h2>

      {description ? (
        <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        {proposal.source_url ? (
          <a
            href={proposal.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline"
          >
            {t("proposals.viewSource")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : <span />}
        <span className="text-[11px] text-muted-foreground">
          {locale === "mt" ? "Aġġornat" : "Updated"} {formatUpdatedAt(proposal.updated_at, locale)}
        </span>
      </div>


      {related.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowRelated((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {showRelated
              ? locale === "mt" ? "Aħbi proposti relatati" : "Hide related proposals"
              : locale === "mt"
                ? `Uri ${related.length} proposti relatati`
                : `Show ${related.length} related proposal${related.length === 1 ? "" : "s"}`}
          </button>
          {showRelated ? (
            <ul className="mt-3 space-y-2">
              {related.map((r) => {
                const rTitle = locale === "mt"
                  ? r.proposal.title_mt || r.proposal.title_en
                  : r.proposal.title_en || r.proposal.title_mt;
                const owner = r.proposal.party
                  ? partyName(r.proposal.party, locale)
                  : r.proposal.candidate?.full_name ?? "";
                return (
                  <li key={r.proposal.id} className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{rTitle}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {r.proposal.party?.color ? (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.proposal.party.color }} />
                          ) : (
                            <Link2 className="h-3 w-3" />
                          )}
                          <span className="truncate">{owner}</span>
                          {r.proposal.category ? <span className="truncate">· {r.proposal.category}</span> : null}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground"
                        title={locale === "mt" ? "Punteġġ ta' similarità" : "Similarity score"}
                      >
                        {Math.round(r.score * 100)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function partyName(party: PartyOption, locale: Locale) {
  return locale === "mt"
    ? party.name_mt || party.name_en
    : party.name_en || party.name_mt || party.slug;
}

function ProposalsError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useT();
  const router = useRouter();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">{t("common.error")}</h1>
      <div className="mt-4 text-left text-sm text-muted-foreground">
        <ErrorComponent error={error} />
      </div>
      <button
        type="button"
        onClick={() => {
          void router.invalidate();
          reset();
        }}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t("common.retry")}
      </button>
    </section>
  );
}

function ProposalsNotFound() {
  const t = useT();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">{t("common.notFound")}</h1>
      <p className="mt-3 text-muted-foreground">{t("notFound.body")}</p>
    </section>
  );
}
