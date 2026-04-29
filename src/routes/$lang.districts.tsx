import {
  createFileRoute,
  ErrorComponent,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ExternalLink, Filter, Map as MapIcon, RotateCcw, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { MaltaDistrictsMap } from "@/components/site/MaltaDistrictsMap";

const districtSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  region: fallback(z.enum(["all", "malta", "gozo"]), "all").default("all"),
});

type DistrictRecord = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
  localities_en: string | null;
  localities_mt: string | null;
  source_url: string | null;
};

type CandidateCountRow = {
  primary_district_id: string | null;
  party_id: string | null;
};

type PartyRow = {
  id: string;
  short_name: string | null;
  name_en: string;
  name_mt: string | null;
  color: string | null;
  slug: string;
};

export type PartyBreakdownEntry = {
  partyId: string | null;
  shortName: string;
  fullName: string;
  color: string | null;
  slug: string | null;
  count: number;
};

async function loadDistricts() {
  const [districtsResult, candidatesResult, partiesResult, linkedResult] = await Promise.all([
    supabase
      .from("districts")
      .select("id, number, name_en, name_mt, localities_en, localities_mt, source_url")
      .eq("status", "published")
      .order("number", { ascending: true }),
    supabase
      .from("candidates")
      .select("id, primary_district_id, party_id, is_incumbent, electoral_confirmed, status"),
    supabase
      .from("parties")
      .select("id, short_name, name_en, name_mt, color, slug")
      .eq("status", "published"),
    supabase
      .from("candidate_districts")
      .select("candidate_id, district_id, election_year")
      .eq("election_year", 2026),
  ]);

  if (districtsResult.error) throw districtsResult.error;
  if (candidatesResult.error) throw candidatesResult.error;
  if (partiesResult.error) throw partiesResult.error;
  if (linkedResult.error) throw linkedResult.error;

  const partiesById = new Map<string, PartyRow>();
  for (const party of (partiesResult.data ?? []) as PartyRow[]) {
    partiesById.set(party.id, party);
  }

  // Build candidate lookup with eligibility for 2026 district pages.
  type CandidateMeta = {
    id: string;
    party_id: string | null;
    is_incumbent: boolean;
    electoral_confirmed: boolean;
    status: string;
  };
  const candidateById = new Map<string, CandidateMeta>();
  for (const c of (candidatesResult.data ?? []) as CandidateMeta[]) {
    candidateById.set(c.id, c);
  }
  const isEligible = (c: CandidateMeta | undefined) =>
    !!c && c.status === "published" && (!c.is_incumbent || c.electoral_confirmed);

  const counts = new Map<string, number>();
  // districtId -> partyId|"__independent__" -> count (deduped by candidate)
  const breakdown = new Map<string, Map<string, number>>();
  // Track candidate_id per district to dedupe across multiple links.
  const seenPerDistrict = new Map<string, Set<string>>();

  for (const link of (linkedResult.data ?? []) as Array<{
    candidate_id: string;
    district_id: string;
  }>) {
    const c = candidateById.get(link.candidate_id);
    if (!isEligible(c)) continue;
    const seen = seenPerDistrict.get(link.district_id) ?? new Set<string>();
    if (seen.has(link.candidate_id)) continue;
    seen.add(link.candidate_id);
    seenPerDistrict.set(link.district_id, seen);

    counts.set(link.district_id, (counts.get(link.district_id) ?? 0) + 1);
    const key = c!.party_id ?? "__independent__";
    const inner = breakdown.get(link.district_id) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + 1);
    breakdown.set(link.district_id, inner);
  }


  const partyBreakdown: Record<string, PartyBreakdownEntry[]> = {};
  for (const [districtId, inner] of breakdown.entries()) {
    const entries: PartyBreakdownEntry[] = Array.from(inner.entries()).map(([key, count]) => {
      if (key === "__independent__") {
        return {
          partyId: null,
          shortName: "IND",
          fullName: "Independent",
          color: null,
          slug: null,
          count,
        };
      }
      const party = partiesById.get(key);
      return {
        partyId: key,
        shortName: party?.short_name || party?.name_en || "—",
        fullName: party?.name_en || party?.short_name || "—",
        color: party?.color ?? null,
        slug: party?.slug ?? null,
        count,
      };
    });
    entries.sort((a, b) => b.count - a.count || a.shortName.localeCompare(b.shortName));
    partyBreakdown[districtId] = entries;
  }

  return {
    districts: (districtsResult.data ?? []) as DistrictRecord[],
    candidateCounts: Object.fromEntries(counts) as Record<string, number>,
    partyBreakdown,
  };
}

export const Route = createFileRoute("/$lang/districts")({
  validateSearch: zodValidator(districtSearchSchema),
  loader: () => loadDistricts(),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "districts.meta.title");
    const description = translate(lang, "districts.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: DistrictsError,
  notFoundComponent: () => <DistrictsNotFound />,
  component: DistrictsPage,
});

function DistrictsPage() {
  const t = useT();
  const navigate = useNavigate({ from: "/$lang/districts" });
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const { districts, candidateCounts, partyBreakdown } = Route.useLoaderData();
  const locale = isLocale(lang) ? lang : "en";

  const updateSearch = (patch: Partial<typeof search>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  const filtered = districts.filter((district: DistrictRecord) => {
    if (search.region === "gozo" && district.number !== 13) return false;
    if (search.region === "malta" && district.number === 13) return false;

    if (!search.q.trim()) return true;
    const haystack = [
      district.name_en,
      district.name_mt,
      district.localities_en,
      district.localities_mt,
      `district ${district.number}`,
      `distrett ${district.number}`,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.q.trim().toLowerCase());
  });

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("districts.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("districts.subtitle")}
          </p>
          <a
            href="https://electoral.gov.mt/ElectoralDivisions"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/70 hover:text-foreground hover:underline"
          >
            {t("districts.viewSource")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="mt-8">
          <h2 className="font-serif text-2xl font-bold text-foreground">
            {t("districts.map.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("districts.map.subtitle")}
          </p>
          <div className="mt-4">
            <MaltaDistrictsMap
              locale={locale}
              candidateCounts={Object.fromEntries(
                districts.map((d: DistrictRecord) => [
                  d.number,
                  candidateCounts[d.id] ?? 0,
                ]),
              )}
              height={460}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1.6fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("candidates.search.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(event) => updateSearch({ q: event.target.value })}
                placeholder={t("districts.search.placeholder")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("districts.region.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={search.region}
                onChange={(event) =>
                  updateSearch({ region: event.target.value as "all" | "malta" | "gozo" })
                }
                className="w-full bg-transparent text-sm text-foreground outline-none"
              >
                <option value="all">{t("districts.region.all")}</option>
                <option value="malta">{t("districts.region.malta")}</option>
                <option value="gozo">{t("districts.region.gozo")}</option>
              </select>
            </span>
          </label>

          <Link
            to="/$lang/districts"
            params={{ lang: locale }}
            search={{ q: "", region: "all" }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            {t("candidates.filters.reset")}
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          {t("districts.results", { count: filtered.length })}
        </p>

        {filtered.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((district: DistrictRecord) => (
              <DistrictCard
                key={district.id}
                district={district}
                locale={locale}
                candidateCount={candidateCounts[district.id] ?? 0}
                partyBreakdown={partyBreakdown[district.id] ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <MapIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-serif text-2xl font-bold text-foreground">
              {t("districts.empty.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("districts.empty.body")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function DistrictCard({
  district,
  locale,
  candidateCount,
  partyBreakdown,
}: {
  district: DistrictRecord;
  locale: Locale;
  candidateCount: number;
  partyBreakdown: PartyBreakdownEntry[];
}) {
  const t = useT();
  const name =
    locale === "mt"
      ? district.name_mt || district.name_en
      : district.name_en || district.name_mt;
  const localities =
    locale === "mt"
      ? district.localities_mt || district.localities_en
      : district.localities_en || district.localities_mt;

  const localityList = (localities ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary font-serif text-xl font-bold text-primary-foreground">
            {district.number}
          </span>
          <div>
            <h2 className="font-serif text-lg font-bold leading-tight text-foreground">
              {name}
            </h2>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("districts.seats")}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
          <Users className="h-3.5 w-3.5" />
          {candidateCount > 0
            ? t("districts.candidates.count", { count: candidateCount })
            : t("districts.candidates.none")}
        </span>
      </div>

      {localityList.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("districts.localities.label")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {localityList.map((locality) => (
              <li
                key={locality}
                className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                {locality}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("districts.partyBreakdown")}
        </p>
        {partyBreakdown.length > 0 ? (
          <>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-accent">
              {partyBreakdown.map((entry) => {
                const pct = candidateCount > 0 ? (entry.count / candidateCount) * 100 : 0;
                return (
                  <span
                    key={entry.partyId ?? "ind"}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: entry.color ?? "hsl(var(--muted-foreground))",
                    }}
                    title={`${entry.fullName}: ${entry.count}`}
                  />
                );
              })}
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {partyBreakdown.map((entry) => (
                <li
                  key={entry.partyId ?? "ind"}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: entry.color ?? "hsl(var(--muted-foreground))" }}
                  />
                  <span>
                    {entry.partyId === null
                      ? t("districts.partyBreakdown.independent")
                      : entry.shortName}
                  </span>
                  <span className="text-muted-foreground">{entry.count}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("districts.partyBreakdown.none")}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <Link
          to="/$lang/candidates"
          params={{ lang: locale }}
          search={{ q: "", party: "all", district: district.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90"
        >
          {t("districts.viewCandidates")}
        </Link>
        {district.source_url ? (
          <a
            href={district.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("districts.viewSource")}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function DistrictsError({ error, reset }: { error: Error; reset: () => void }) {
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

function DistrictsNotFound() {
  const t = useT();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">{t("common.notFound")}</h1>
      <p className="mt-3 text-muted-foreground">{t("notFound.body")}</p>
    </section>
  );
}
