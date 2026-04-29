import {
  createFileRoute,
  ErrorComponent,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowLeft,
  ExternalLink,
  GitCompareArrows,
  Map as MapIcon,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { setPreferredDistrict } from "@/lib/preferredDistrict";

type DistrictRow = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
  localities_en: string | null;
  localities_mt: string | null;
  source_url: string | null;
};

type PartyLite = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
};

type CandidateRow = {
  id: string;
  slug: string;
  full_name: string;
  photo_url: string | null;
  electoral_confirmed: boolean;
  is_incumbent: boolean;
  party: PartyLite | null;
  primary_district_id: string | null;
};

type ProposalRow = {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  source_url: string | null;
  party_id: string | null;
};

async function loadMyDistrict(rawNumber: string) {
  const number = Number(rawNumber);
  if (!Number.isInteger(number) || number < 1 || number > 13) {
    throw notFound();
  }

  const { data: district, error: districtError } = await supabase
    .from("districts")
    .select("id, number, name_en, name_mt, localities_en, localities_mt, source_url")
    .eq("number", number)
    .eq("status", "published")
    .maybeSingle();

  if (districtError) throw districtError;
  if (!district) throw notFound();

  const districtTyped = district as DistrictRow;

  // Candidates: only those linked via candidate_districts for the 2026
  // election and published. Sitting MPs only show up here if they have been
  // confirmed as running for 2026.
  const linkedRes = await supabase
    .from("candidate_districts")
    .select(
      "candidate_id, election_year, candidate:candidates(id, slug, full_name, photo_url, electoral_confirmed, is_incumbent, primary_district_id, status, party:parties(id, slug, name_en, name_mt, short_name, color))"
    )
    .eq("district_id", districtTyped.id)
    .eq("election_year", 2026);

  if (linkedRes.error) throw linkedRes.error;

  const byId = new Map<string, CandidateRow>();
  for (const link of (linkedRes.data ?? []) as Array<{
    candidate: (CandidateRow & { status: string }) | null;
  }>) {
    const c = link.candidate;
    if (!c || c.status !== "published") continue;
    if (!byId.has(c.id)) byId.set(c.id, c);
  }

  const candidates = Array.from(byId.values()).sort((a, b) => {
    if (a.electoral_confirmed !== b.electoral_confirmed) {
      return a.electoral_confirmed ? -1 : 1;
    }
    return a.full_name.localeCompare(b.full_name);
  });

  // Proposals from parties that have at least one candidate in this district.
  const partyIds = Array.from(
    new Set(
      candidates
        .map((c) => c.party?.id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let proposals: ProposalRow[] = [];
  if (partyIds.length > 0) {
    const { data, error } = await supabase
      .from("proposals")
      .select(
        "id, title_en, title_mt, description_en, description_mt, category, source_url, party_id"
      )
      .eq("status", "published")
      .in("party_id", partyIds)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    proposals = (data ?? []) as ProposalRow[];
  }

  return { district: districtTyped, candidates, proposals };
}

export const Route = createFileRoute("/$lang/my-district/$number")({
  loader: ({ params }) => loadMyDistrict(params.number),
  head: ({ params, loaderData }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const number = params.number;
    const districtName = loaderData?.district
      ? lang === "mt"
        ? loaderData.district.name_mt || loaderData.district.name_en
        : loaderData.district.name_en || loaderData.district.name_mt
      : `District ${number}`;
    const title =
      lang === "mt"
        ? `Distrett ${number} — ${districtName} | Vot Malta 2026`
        : `District ${number} — ${districtName} | Vot Malta 2026`;
    const description =
      lang === "mt"
        ? `Il-kandidati, il-partiti u l-proposti għad-Distrett ${number} (${districtName}) fl-Elezzjoni Ġenerali Maltija 2026.`
        : `Candidates, parties, and proposals for District ${number} (${districtName}) in Malta's 2026 General Election.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: MyDistrictError,
  notFoundComponent: MyDistrictNotFound,
  component: MyDistrictPage,
});

function MyDistrictPage() {
  const t = useT();
  const { lang, number } = Route.useParams();
  const { district, candidates, proposals } = Route.useLoaderData();
  const locale: Locale = isLocale(lang) ? lang : "en";

  const name =
    locale === "mt"
      ? district.name_mt || district.name_en
      : district.name_en || district.name_mt;

  const localities = (
    locale === "mt"
      ? district.localities_mt || district.localities_en
      : district.localities_en || district.localities_mt
  ) ?? "";
  const localityList = localities
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Persist this as the user's preferred district so the homepage banner can
  // welcome them back next time.
  useEffect(() => {
    setPreferredDistrict({ number: district.number });
  }, [district.number]);

  // Group candidates by party for display.
  const grouped = new Map<string, { party: PartyLite | null; rows: CandidateRow[] }>();
  for (const c of candidates) {
    const key = c.party?.id ?? "__ind__";
    const existing = grouped.get(key) ?? { party: c.party, rows: [] };
    existing.rows.push(c);
    grouped.set(key, existing);
  }
  const partyGroups = Array.from(grouped.values()).sort(
    (a, b) => b.rows.length - a.rows.length
  );

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <Link
          to="/$lang"
          params={{ lang: locale }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("myDistrict.changeDistrict")}
        </Link>

        <div className="mt-6 flex items-start gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary font-serif text-3xl font-bold text-primary-foreground shadow-card">
            {district.number}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("myDistrict.eyebrow")}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-foreground md:text-5xl">
              {t("myDistrict.heading", { number: district.number, name: name ?? "" })}
            </h1>
            {localityList.length > 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                {localityList.join(" · ")}
              </p>
            ) : null}
            {district.source_url ? (
              <a
                href={district.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("districts.viewSource")}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold text-foreground">
                {t("myDistrict.candidates.title")}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">
                <Users className="h-3.5 w-3.5" />
                {t("districts.candidates.count", { count: candidates.length })}
              </span>
            </div>

            {candidates.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted-foreground">
                {t("myDistrict.candidates.empty")}
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {partyGroups.map((group) => {
                  const partyName = group.party
                    ? locale === "mt"
                      ? group.party.name_mt || group.party.name_en
                      : group.party.name_en || group.party.name_mt
                    : t("districts.partyBreakdown.independent");
                  return (
                    <div key={group.party?.id ?? "ind"}>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor:
                              group.party?.color ?? "hsl(var(--muted-foreground))",
                          }}
                        />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                          {partyName}{" "}
                          <span className="text-muted-foreground">({group.rows.length})</span>
                        </h3>
                      </div>
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {group.rows.map((c) => (
                          <li key={c.id}>
                            <Link
                              to="/$lang/candidates/$slug"
                              params={{ lang: locale, slug: c.slug }}
                              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                            >
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-bold text-accent-foreground">
                                {c.photo_url ? (
                                  <img
                                    src={c.photo_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  c.full_name
                                    .split(" ")
                                    .map((p) => p[0])
                                    .slice(0, 2)
                                    .join("")
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-foreground">
                                  {c.full_name}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {c.is_incumbent
                                    ? t("myDistrict.candidates.incumbent")
                                    : c.electoral_confirmed
                                    ? t("myDistrict.candidates.confirmed")
                                    : t("myDistrict.candidates.prospective")}
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    to="/$lang/candidates"
                    params={{ lang: locale }}
                    search={{ q: "", party: "all", district: district.id }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background hover:bg-foreground/90"
                  >
                    {t("districts.viewCandidates")}
                  </Link>
                  <Link
                    to="/$lang/compare"
                    params={{ lang: locale }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
                  >
                    <GitCompareArrows className="h-3.5 w-3.5" />
                    {t("myDistrict.compareCta")}
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
              <h2 className="font-serif text-lg font-bold text-foreground">
                {t("myDistrict.proposals.title")}
              </h2>
              {proposals.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("myDistrict.proposals.empty")}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {proposals.slice(0, 6).map((p) => {
                    const title =
                      locale === "mt" ? p.title_mt || p.title_en : p.title_en || p.title_mt;
                    return (
                      <li key={p.id} className="border-b border-border pb-3 last:border-b-0">
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        {p.category ? (
                          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {p.category}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                to="/$lang/proposals"
                params={{ lang: locale }}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                {t("myDistrict.proposals.seeAll")}
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {t("myDistrict.askCta.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("myDistrict.askCta.body")}
              </p>
              <Link
                to="/$lang/ask"
                params={{ lang: locale }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {t("myDistrict.askCta.button")}
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          {t("myDistrict.disclaimer", { number: district.number })}
        </p>
        <p className="sr-only">{number}</p>
      </div>
    </section>
  );
}

function MyDistrictError({ error, reset }: { error: Error; reset: () => void }) {
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

function MyDistrictNotFound() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <MapIcon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground">
        {translate(locale, "myDistrict.notFound.title")}
      </h1>
      <p className="mt-3 text-muted-foreground">{translate(locale, "myDistrict.notFound.body")}</p>
      <Link
        to="/$lang/districts"
        params={{ lang: locale }}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {translate(locale, "districts.title")}
      </Link>
    </section>
  );
}
