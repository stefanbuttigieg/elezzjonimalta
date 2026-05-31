import { createFileRoute, ErrorComponent, Link } from "@tanstack/react-router";
import { Star, MapPin, ArrowRight, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { CandidateAvatar } from "@/components/site/CandidateAvatar";
import { setEdgeCacheHeader } from "@/lib/ssrCache";

type PartyLite = {
  slug: string;
  short_name: string | null;
  name_en: string;
  name_mt: string | null;
  color: string | null;
};

type ElectedRow = {
  candidate_id: string;
  district_id: string;
  votes_first_count: number | null;
  elected_via_gcm: boolean | null;
  elected_via_proportionality: boolean | null;
  candidate: {
    id: string;
    slug: string;
    full_name: string;
    photo_url: string | null;
    party: PartyLite | null;
  } | null;
  district: {
    id: string;
    number: number;
    name_en: string;
    name_mt: string | null;
  } | null;
};

type ElectedCandidate = {
  slug: string;
  full_name: string;
  photo_url: string | null;
  votes: number | null;
  elected_via_gcm: boolean;
  elected_via_proportionality: boolean;
  party: PartyLite | null;
  also_in: Array<{ number: number; name_en: string; name_mt: string | null }>;
};

type DistrictGroup = {
  number: number;
  name_en: string;
  name_mt: string | null;
  elected: ElectedCandidate[];
};

type PartyTally = PartyLite & { count: number };

type DistrictLite = { number: number; name_en: string; name_mt: string | null };

type MultiDistrictWinner = {
  slug: string;
  full_name: string;
  photo_url: string | null;
  party: PartyLite | null;
  districts: Array<{ number: number; name_en: string; name_mt: string | null; votes: number | null }>;
};

type LoaderData = {
  groups: DistrictGroup[];
  totalElected: number;
  totalSeats: number;
  multiDistrictWinners: MultiDistrictWinner[];
  byParty: PartyTally[];
  allDistricts: DistrictLite[];
};

async function loadElected(): Promise<LoaderData> {
  const [electedRes, districtsRes] = await Promise.all([
    supabase
      .from("candidate_districts")
      .select(
        "candidate_id, district_id, votes_first_count, elected_via_gcm, candidate:candidates(id, slug, full_name, photo_url, party:parties(slug, short_name, name_en, name_mt, color)), district:districts(id, number, name_en, name_mt)"
      )
      .eq("election_year", 2026)
      .eq("elected", true),
    supabase
      .from("districts")
      .select("number, name_en, name_mt")
      .eq("status", "published")
      .order("number"),
  ]);

  const rows = (electedRes.data ?? []) as unknown as ElectedRow[];
  const groupMap = new Map<number, DistrictGroup>();
  const partyMap = new Map<string, PartyTally>();
  const candidateSeen = new Set<string>();
  const candidateInfo = new Map<string, MultiDistrictWinner>();
  let totalSeats = 0;

  for (const r of rows) {
    if (!r.candidate || !r.district) continue;
    totalSeats += 1;
    const g = groupMap.get(r.district.number) ?? {
      number: r.district.number,
      name_en: r.district.name_en,
      name_mt: r.district.name_mt,
      elected: [],
    };
    g.elected.push({
      slug: r.candidate.slug,
      full_name: r.candidate.full_name,
      photo_url: r.candidate.photo_url,
      votes: r.votes_first_count,
      elected_via_gcm: !!r.elected_via_gcm,
      party: r.candidate.party,
      also_in: [],
    });
    groupMap.set(r.district.number, g);

    const info = candidateInfo.get(r.candidate.slug) ?? {
      slug: r.candidate.slug,
      full_name: r.candidate.full_name,
      photo_url: r.candidate.photo_url,
      party: r.candidate.party,
      districts: [],
    };
    info.districts.push({
      number: r.district.number,
      name_en: r.district.name_en,
      name_mt: r.district.name_mt,
      votes: r.votes_first_count,
    });
    candidateInfo.set(r.candidate.slug, info);

    if (candidateSeen.has(r.candidate.slug)) continue;
    candidateSeen.add(r.candidate.slug);

    const p = r.candidate.party;
    if (p) {
      const existing = partyMap.get(p.slug) ?? { ...p, count: 0 };
      existing.count += 1;
      partyMap.set(p.slug, existing);
    } else {
      const key = "__independent";
      const existing =
        partyMap.get(key) ?? {
          slug: key,
          short_name: null,
          name_en: "Independent",
          name_mt: "Indipendenti",
          color: null,
          count: 0,
        };
      existing.count += 1;
      partyMap.set(key, existing);
    }
  }

  // Fill also_in (other districts) per card
  for (const g of groupMap.values()) {
    for (const c of g.elected) {
      const info = candidateInfo.get(c.slug);
      if (!info || info.districts.length <= 1) continue;
      c.also_in = info.districts
        .filter((d) => d.number !== g.number)
        .map((d) => ({ number: d.number, name_en: d.name_en, name_mt: d.name_mt }));
    }
    g.elected.sort((a, b) => {
      if ((b.votes ?? -1) !== (a.votes ?? -1)) return (b.votes ?? -1) - (a.votes ?? -1);
      return a.full_name.localeCompare(b.full_name);
    });
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.number - b.number);
  const byParty = Array.from(partyMap.values()).sort((a, b) => b.count - a.count);
  const multiDistrictWinners = Array.from(candidateInfo.values())
    .filter((w) => w.districts.length > 1)
    .sort((a, b) => b.districts.length - a.districts.length || a.full_name.localeCompare(b.full_name));

  return {
    groups,
    totalElected: candidateSeen.size,
    totalSeats,
    multiDistrictWinners,
    byParty,
    allDistricts: (districtsRes.data ?? []) as DistrictLite[],
  };
}

const EMPTY_DATA: LoaderData = {
  groups: [],
  totalElected: 0,
  totalSeats: 0,
  multiDistrictWinners: [],
  byParty: [],
  allDistricts: [],
};

export const Route = createFileRoute("/$lang/elected")({
  loader: async (): Promise<LoaderData> => {
    setEdgeCacheHeader("public, s-maxage=30, stale-while-revalidate=120");
    return loadElected().catch(() => EMPTY_DATA);
  },
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "elected.meta.title");
    const description = translate(lang, "elected.meta.description");
    const url = `https://elezzjoni.app/${lang}/elected`;
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
  errorComponent: ErrorComponent,
  component: ElectedPage,
});

function ElectedPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const data = Route.useLoaderData() as LoaderData;

  const districtsWithResults = new Set(data.groups.map((g) => g.number));
  const pending = data.allDistricts.filter((d) => !districtsWithResults.has(d.number));

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <header className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            {t("home.elected.eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-5xl">
            {t("elected.title")}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("elected.subtitle")}
          </p>
          {data.totalElected > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {t("home.elected.countSummary", {
                  total: data.totalElected,
                  districts: data.groups.length,
                })}
              </p>
              {data.totalSeats !== data.totalElected ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                  {t("elected.seatsAwarded", { count: data.totalSeats })}
                </p>
              ) : null}
              {data.multiDistrictWinners.length > 0 ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t("home.elected.multiDistrict", { count: data.multiDistrictWinners.length })}
                </p>
              ) : null}
            </div>
          ) : null}
        </header>

        {data.byParty.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("elected.byParty")}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.byParty.map((p) => (
                <span
                  key={p.slug}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: p.color ?? "hsl(var(--muted-foreground))" }}
                    aria-hidden="true"
                  />
                  <span>
                    {(locale === "mt" ? p.name_mt : p.name_en) ?? p.name_en}
                    {p.short_name ? ` (${p.short_name})` : ""}
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {p.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {data.multiDistrictWinners.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 shadow-card ring-1 ring-amber-500/20">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              {t("elected.multiDistrict.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("elected.multiDistrict.subtitle")}
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.multiDistrictWinners.map((w) => (
                <li key={w.slug}>
                  <Link
                    to="/$lang/candidates/$slug"
                    params={{ lang: locale, slug: w.slug }}
                    className="group flex items-center gap-3 rounded-xl border border-amber-500/40 bg-background p-3 transition-colors hover:border-amber-500/70"
                  >
                    <CandidateAvatar
                      src={w.photo_url}
                      name={w.full_name}
                      className="h-12 w-12 rounded-full object-cover"
                      fallbackClassName="h-12 w-12 rounded-full bg-accent text-accent-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground group-hover:text-primary">
                        {w.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {w.party
                          ? (locale === "mt" ? w.party.name_mt : w.party.name_en) ?? w.party.name_en
                          : locale === "mt"
                            ? "Indipendenti"
                            : "Independent"}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        {w.districts
                          .map((d) => `${d.number} — ${(locale === "mt" ? d.name_mt : d.name_en) ?? d.name_en}`)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.groups.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <Star className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-base text-muted-foreground">{t("elected.empty")}</p>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {data.groups.map((g) => (
              <article
                key={g.number}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card md:p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-serif text-xl font-bold text-foreground md:text-2xl">
                    {t("elected.districtHeading", {
                      number: g.number,
                      name: (locale === "mt" ? g.name_mt : g.name_en) ?? g.name_en,
                    })}
                  </h2>
                  <Link
                    to="/$lang/my-district/$number"
                    params={{ lang: locale, number: String(g.number) }}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {locale === "mt" ? "Iddettal id-distrett" : "District details"}{" "}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.elected.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to="/$lang/candidates/$slug"
                        params={{ lang: locale, slug: c.slug }}
                        className={`group flex items-center gap-3 rounded-xl border p-3 ring-1 transition-colors ${
                          c.also_in.length > 0
                            ? "border-amber-500/50 bg-amber-500/5 ring-amber-500/30 hover:border-amber-500/70 hover:bg-amber-500/10"
                            : "border-emerald-500/40 bg-emerald-500/5 ring-emerald-500/20 hover:border-emerald-500/60 hover:bg-emerald-500/10"
                        }`}
                      >
                        <CandidateAvatar
                          src={c.photo_url}
                          name={c.full_name}
                          className="h-12 w-12 rounded-full object-cover"
                          fallbackClassName="h-12 w-12 rounded-full bg-accent text-accent-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Star
                              className={`h-3.5 w-3.5 ${c.also_in.length > 0 ? "fill-amber-500 text-amber-500" : "fill-emerald-500 text-emerald-500"}`}
                              aria-hidden="true"
                            />
                            <p className="truncate font-semibold text-foreground group-hover:text-primary">
                              {c.full_name}
                            </p>
                            {c.also_in.length > 0 ? (
                              <span
                                className="inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                                title={c.also_in
                                  .map((d) => `${d.number} — ${(locale === "mt" ? d.name_mt : d.name_en) ?? d.name_en}`)
                                  .join(", ")}
                              >
                                ×{c.also_in.length + 1}
                              </span>
                            ) : null}
                          </div>
                          {c.also_in.length > 0 ? (
                            <p className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                              {t("elected.alsoElectedIn", {
                                districts: c.also_in.map((d) => `#${d.number}`).join(", "),
                              })}
                            </p>
                          ) : null}
                          <p className="truncate text-xs text-muted-foreground">
                            {c.party
                              ? (locale === "mt" ? c.party.name_mt : c.party.name_en) ??
                                c.party.name_en
                              : locale === "mt"
                                ? "Indipendenti"
                                : "Independent"}
                            {c.party?.short_name ? ` · ${c.party.short_name}` : ""}
                          </p>
                          {c.elected_via_gcm ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
                              {t("elected.gcm.short")}
                            </p>
                          ) : null}
                          {c.votes != null ? (
                            <p className="mt-0.5 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                              {t("elected.votes", { count: c.votes.toLocaleString() })}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        {pending.length > 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface/50 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {locale === "mt"
                ? "Distretti li għad iridu jiġu kkonfermati"
                : "Districts still being counted"}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((d) => (
                <Link
                  key={d.number}
                  to="/$lang/my-district/$number"
                  params={{ lang: locale, number: String(d.number) }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  {t("elected.districtHeading", {
                    number: d.number,
                    name: (locale === "mt" ? d.name_mt : d.name_en) ?? d.name_en,
                  })}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
