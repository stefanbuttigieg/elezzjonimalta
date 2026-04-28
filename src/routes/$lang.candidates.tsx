import {
  createFileRoute,
  ErrorComponent,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { BadgeCheck, ExternalLink, Filter, RotateCcw, Search, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

const candidateSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  party: fallback(z.string(), "all").default("all"),
  district: fallback(z.string(), "all").default("all"),
});

type PartyOption = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
};

type DistrictOption = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
};

type CandidateRecord = {
  id: string;
  slug: string;
  full_name: string;
  bio_en: string | null;
  bio_mt: string | null;
  photo_url: string | null;
  website: string | null;
  is_incumbent: boolean;
  electoral_confirmed: boolean;
  party: PartyOption | null;
  district: DistrictOption | null;
};

async function loadCandidates({
  q,
  party,
  district,
}: {
  q: string;
  party: string;
  district: string;
}) {
  const cleanQuery = q.trim();
  let candidatesQuery = supabase
    .from("candidates")
    .select(
      "id, slug, full_name, bio_en, bio_mt, photo_url, website, is_incumbent, electoral_confirmed, party:parties(id, slug, name_en, name_mt, short_name, color), district:districts(id, number, name_en, name_mt)",
    )
    .eq("status", "published")
    .order("full_name", { ascending: true });

  if (cleanQuery) candidatesQuery = candidatesQuery.ilike("full_name", `%${cleanQuery}%`);
  if (party !== "all") candidatesQuery = candidatesQuery.eq("party_id", party);
  if (district !== "all") candidatesQuery = candidatesQuery.eq("primary_district_id", district);

  const [candidatesResult, partiesResult, districtsResult] = await Promise.all([
    candidatesQuery,
    supabase
      .from("parties")
      .select("id, slug, name_en, name_mt, short_name, color")
      .eq("status", "published")
      .order("name_en", { ascending: true }),
    supabase
      .from("districts")
      .select("id, number, name_en, name_mt")
      .eq("status", "published")
      .order("number", { ascending: true }),
  ]);

  if (candidatesResult.error) throw candidatesResult.error;
  if (partiesResult.error) throw partiesResult.error;
  if (districtsResult.error) throw districtsResult.error;

  return {
    candidates: (candidatesResult.data ?? []) as CandidateRecord[],
    parties: (partiesResult.data ?? []) as PartyOption[],
    districts: (districtsResult.data ?? []) as DistrictOption[],
  };
}

export const Route = createFileRoute("/$lang/candidates")({
  validateSearch: zodValidator(candidateSearchSchema),
  loaderDeps: ({ search: { q, party, district } }) => ({ q, party, district }),
  loader: ({ deps }) => loadCandidates(deps),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "candidates.meta.title");
    const description = translate(lang, "candidates.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: CandidatesError,
  notFoundComponent: () => <CandidatesNotFound />,
  component: CandidatesPage,
});

function CandidatesPage() {
  const t = useT();
  const navigate = useNavigate({ from: "/$lang/candidates" });
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const { candidates, parties, districts } = Route.useLoaderData();
  const locale = isLocale(lang) ? lang : "en";

  const updateSearch = (patch: Partial<typeof search>) => {
    void navigate({
      search: { ...search, ...patch },
    });
  };

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("candidates.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("candidates.subtitle")}
          </p>
        </div>

        <div className="mt-8 grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("candidates.search.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(event) => updateSearch({ q: event.target.value })}
                placeholder={t("candidates.search.placeholder")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>

          <FilterSelect
            label={t("candidates.party.label")}
            value={search.party}
            onChange={(value) => updateSearch({ party: value })}
            options={parties.map((partyOption: PartyOption) => ({
              value: partyOption.id,
              label: partyName(partyOption, locale),
            }))}
            allLabel={t("candidates.party.all")}
          />

          <FilterSelect
            label={t("candidates.district.label")}
            value={search.district}
            onChange={(value) => updateSearch({ district: value })}
            options={districts.map((districtOption: DistrictOption) => ({
              value: districtOption.id,
              label: districtName(districtOption, locale),
            }))}
            allLabel={t("candidates.district.all")}
          />

          <Link
            to="/$lang/candidates"
            params={{ lang: locale }}
            search={{ q: "", party: "all", district: "all" }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            {t("candidates.filters.reset")}
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>{t("candidates.results", { count: candidates.length })}</p>
        </div>

        {candidates.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {candidates.map((candidate: CandidateRecord) => (
              <CandidateCard key={candidate.id} candidate={candidate} locale={locale} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-serif text-2xl font-bold text-foreground">
              {t("candidates.empty.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("candidates.empty.body")}
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

function CandidateCard({ candidate, locale }: { candidate: CandidateRecord; locale: Locale }) {
  const t = useT();
  const bio =
    locale === "mt" ? candidate.bio_mt || candidate.bio_en : candidate.bio_en || candidate.bio_mt;

  return (
    <article className="flex min-h-[260px] flex-col rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-4">
        {candidate.photo_url ? (
          <img
            src={candidate.photo_url}
            alt={candidate.full_name}
            className="h-16 w-16 rounded-lg border border-border object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <UserRound className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-bold leading-tight text-foreground">
            {candidate.full_name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              candidate.party ? partyName(candidate.party, locale) : null,
              candidate.district ? districtName(candidate.district, locale) : null,
            ]
              .filter(Boolean)
              .join(" · ") || t("candidates.unassigned")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {candidate.is_incumbent ? <Badge label={t("common.sittingMp")} /> : null}
        {candidate.electoral_confirmed ? <Badge label={t("common.electoralConfirmed")} /> : null}
      </div>

      <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
        {bio || t("candidates.bio.empty")}
      </p>

      {candidate.website ? (
        <a
          href={candidate.website}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline"
        >
          {t("candidates.website")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
      <BadgeCheck className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function partyName(party: PartyOption, locale: Locale) {
  return locale === "mt"
    ? party.name_mt || party.name_en
    : party.name_en || party.name_mt || party.slug;
}

function districtName(district: DistrictOption, locale: Locale) {
  const name =
    locale === "mt" ? district.name_mt || district.name_en : district.name_en || district.name_mt;
  return `${district.number} · ${name}`;
}

function CandidatesError({ error, reset }: { error: Error; reset: () => void }) {
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

function CandidatesNotFound() {
  const t = useT();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">{t("common.notFound")}</h1>
      <p className="mt-3 text-muted-foreground">{t("notFound.body")}</p>
    </section>
  );
}
