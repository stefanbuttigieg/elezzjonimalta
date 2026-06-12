import { createFileRoute, ErrorComponent, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, MapPin, ArrowRight, Trophy, Radio, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { CandidateAvatar } from "@/components/site/CandidateAvatar";
import { setEdgeCacheHeader } from "@/lib/ssrCache";
import { getPnLiveResults, type PnLiveResults, type PnDistrictResult } from "@/lib/pnLiveResults.functions";
import { getElcomFirstCount, type ElcomFirstCount } from "@/lib/elcomFirstCount.functions";
import { ElcomCandidateCountsPanel } from "@/components/site/ElcomCandidateCountsPanel";

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
  elected_via_casual: boolean | null;
  relinquished: boolean | null;
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
  elected_via_casual: boolean;
  relinquished: boolean;
  party: PartyLite | null;
  also_in: Array<{ number: number; name_en: string; name_mt: string | null }>;
};

type DistrictGroup = {
  number: number;
  name_en: string;
  name_mt: string | null;
  elected: ElectedCandidate[];
};

type PartyTally = PartyLite & { count: number; seats: number; propSeats: number };

type DistrictLite = { number: number; name_en: string; name_mt: string | null };

type MultiDistrictWinner = {
  slug: string;
  full_name: string;
  photo_url: string | null;
  party: PartyLite | null;
  districts: Array<{ number: number; name_en: string; name_mt: string | null; votes: number | null }>;
};

type CasualNominee = {
  slug: string;
  full_name: string;
  photo_url: string | null;
  party: PartyLite | null;
  nomination_date: string | null;
  district: { number: number; name_en: string; name_mt: string | null } | null;
};

type LoaderData = {
  groups: DistrictGroup[];
  totalElected: number;
  totalSeats: number;
  proportionalitySeats: number;
  casualSeats: number;
  multiDistrictWinners: MultiDistrictWinner[];
  byParty: PartyTally[];
  allDistricts: DistrictLite[];
  casualNominees: CasualNominee[];
  pnLive: PnLiveResults | null;
  elcomFirstCount: ElcomFirstCount | null;
};


async function loadElected(): Promise<LoaderData> {
  const [electedRes, districtsRes, casualRes] = await Promise.all([
    supabase
      .from("candidate_districts")
      .select(
        "candidate_id, district_id, votes_first_count, elected_via_gcm, elected_via_proportionality, elected_via_casual, relinquished, candidate:candidates(id, slug, full_name, photo_url, party:parties(slug, short_name, name_en, name_mt, color)), district:districts(id, number, name_en, name_mt)"
      )
      .eq("election_year", 2026)
      .eq("elected", true),
    supabase
      .from("districts")
      .select("number, name_en, name_mt")
      .eq("status", "published")
      .order("number"),
    supabase
      .from("candidates")
      .select(
        "slug, full_name, photo_url, casual_nomination_date, party:parties(slug, short_name, name_en, name_mt, color), district:districts!candidates_casual_nomination_district_id_fkey(number, name_en, name_mt)"
      )
      .eq("casual_nomination_submitted", true)
      .eq("status", "published")
      .order("full_name"),
  ]);

  const rows = (electedRes.data ?? []) as unknown as ElectedRow[];
  const groupMap = new Map<number, DistrictGroup>();
  const partyMap = new Map<string, PartyTally>();
  const candidateSeen = new Set<string>();
  const candidateInfo = new Map<string, MultiDistrictWinner>();
  let totalSeats = 0;
  let proportionalitySeats = 0;
  let casualSeats = 0;

  for (const r of rows) {
    if (!r.candidate || !r.district) continue;
    totalSeats += 1;
    if (r.elected_via_proportionality) proportionalitySeats += 1;
    if (r.elected_via_casual) casualSeats += 1;
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
      elected_via_proportionality: !!r.elected_via_proportionality,
      elected_via_casual: !!r.elected_via_casual,
      relinquished: !!r.relinquished,
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

    const p = r.candidate.party;
    const isFirstSeat = !candidateSeen.has(r.candidate.slug);
    candidateSeen.add(r.candidate.slug);

    if (p) {
      const existing =
        partyMap.get(p.slug) ?? { ...p, count: 0, seats: 0, propSeats: 0 };
      existing.seats += 1;
      if (r.elected_via_proportionality) existing.propSeats += 1;
      if (isFirstSeat) existing.count += 1;
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
          seats: 0,
          propSeats: 0,
        };
      existing.seats += 1;
      if (r.elected_via_proportionality) existing.propSeats += 1;
      if (isFirstSeat) existing.count += 1;
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
  const byParty = Array.from(partyMap.values()).sort((a, b) => b.seats - a.seats || b.count - a.count);
  const multiDistrictWinners = Array.from(candidateInfo.values())
    .filter((w) => w.districts.length > 1)
    .sort((a, b) => b.districts.length - a.districts.length || a.full_name.localeCompare(b.full_name));

  return {
    groups,
    totalElected: candidateSeen.size,
    totalSeats,
    proportionalitySeats,
    casualSeats,
    multiDistrictWinners,
    byParty,
    allDistricts: (districtsRes.data ?? []) as DistrictLite[],
    casualNominees: ((casualRes.data ?? []) as unknown as CasualNominee[]),
    pnLive: null,
    elcomFirstCount: null,
  };
}

const EMPTY_DATA: LoaderData = {
  groups: [],
  totalElected: 0,
  totalSeats: 0,
  proportionalitySeats: 0,
  casualSeats: 0,
  multiDistrictWinners: [],
  byParty: [],
  allDistricts: [],
  casualNominees: [],
  pnLive: null,
  elcomFirstCount: null,
};

export const Route = createFileRoute("/$lang/elected")({
  loader: async (): Promise<LoaderData> => {
    setEdgeCacheHeader("public, s-maxage=30, stale-while-revalidate=120");
    const [base, pnLive, elcomFirstCount] = await Promise.all([
      loadElected().catch(() => EMPTY_DATA),
      getPnLiveResults().catch(() => null),
      getElcomFirstCount().catch(() => null),
    ]);
    return { ...base, pnLive: pnLive ?? null, elcomFirstCount: elcomFirstCount ?? null };
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

const PN_REFRESH_MS = 5 * 60 * 1000;

function formatRelative(fromIso: string, now: number, locale: Locale): string {
  const t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (locale === "mt") {
    if (diff < 10) return "issa";
    if (diff < 60) return `${diff}s ilu`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m} min ilu`;
    const h = Math.floor(m / 60);
    return `${h}s ilu`;
  }
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function PnLiveStatus({ generatedAt, locale }: { generatedAt: string; locale: Locale }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // Tick the relative timestamp every 15s for a fresh display.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  // Auto-refresh on the same cadence as the Firecrawl cache (5 min).
  useEffect(() => {
    const fetched = new Date(generatedAt).getTime();
    const elapsed = Date.now() - (Number.isFinite(fetched) ? fetched : Date.now());
    const firstDelay = Math.max(5_000, PN_REFRESH_MS - elapsed);
    let interval: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      void router.invalidate();
      interval = setInterval(() => {
        void router.invalidate();
      }, PN_REFRESH_MS);
    }, firstDelay);
    return () => {
      clearTimeout(firstTimer);
      if (interval) clearInterval(interval);
    };
  }, [generatedAt, router]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 font-medium text-foreground/80">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        {locale === "mt" ? "Dirett" : "Live"}
      </span>
      <span>
        {locale === "mt" ? "Aġġornat l-aħħar " : "Last updated "}
        <span className="font-medium text-foreground/80">{formatRelative(generatedAt, now, locale)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        {locale === "mt" ? "jiġġedded kull 5 min" : "auto-refresh every 5 min"}
      </span>
    </div>
  );
}

function PnAttribution({ locale, updatedAt }: { locale: Locale; updatedAt: string | null }) {
  return (
    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
      {locale === "mt" ? "Sors: " : "Source: "}
      <a
        href="https://pn.org.mt/results/"
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-0.5 font-medium text-foreground/80 underline decoration-dotted hover:text-primary"
      >
        Partit Nazzjonalista — Riżultati Diretti <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>{" "}
      {locale === "mt" ? "ipprovduti minn " : "data from "}
      <a
        href="https://electoral.gov.mt/"
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-foreground/80 underline decoration-dotted hover:text-primary"
      >
        ELCOM
      </a>
      {updatedAt ? ` · ${locale === "mt" ? "aġġornat" : "updated"} ${updatedAt}` : ""}
    </p>
  );
}

function PnDistrictBand({ d, locale }: { d: PnDistrictResult; locale: Locale }) {
  const leaderClasses =
    d.leader === "PL"
      ? "border-rose-500/40 bg-rose-500/5"
      : d.leader === "PN"
        ? "border-sky-500/40 bg-sky-500/5"
        : "border-border bg-surface";
  return (
    <div className={`mt-4 rounded-xl border ${leaderClasses} p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Radio className="h-3 w-3" aria-hidden="true" />
          {locale === "mt" ? "Riżultati diretti — l-ewwel għadd" : "Live first-count results"}
          {d.percentCounted != null ? (
            <span className="ml-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-foreground">
              {d.percentCounted}% {locale === "mt" ? "magħduda" : "counted"}
            </span>
          ) : null}
        </p>
        {d.leader ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              d.leader === "PL" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
            }`}
          >
            {d.leader} ▲ {locale === "mt" ? "fuq quddiem" : "leading"}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">PN</p>
          <p className="font-bold tabular-nums text-foreground">{d.pnPercent != null ? `${d.pnPercent}%` : "—"}</p>
          <p className="tabular-nums text-muted-foreground">{d.pnVotes?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">PL</p>
          <p className="font-bold tabular-nums text-foreground">{d.plPercent != null ? `${d.plPercent}%` : "—"}</p>
          <p className="tabular-nums text-muted-foreground">{d.plVotes?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">ADPD</p>
          <p className="font-bold tabular-nums text-foreground">{d.adpdVotes?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Momentum</p>
          <p className="font-bold tabular-nums text-foreground">{d.momentumVotes?.toLocaleString() ?? "—"}</p>
        </div>
      </div>
      {d.totalVotes != null ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {locale === "mt" ? "Total voti: " : "Total votes: "}
          <span className="font-semibold tabular-nums text-foreground">{d.totalVotes.toLocaleString()}</span>
        </p>
      ) : null}
    </div>
  );
}

function ElectedPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const data = Route.useLoaderData() as LoaderData;

  const districtsWithResults = new Set(data.groups.map((g) => g.number));
  const pending = data.allDistricts.filter((d) => !districtsWithResults.has(d.number));
  const pnLive = data.pnLive && data.pnLive.ok ? data.pnLive : null;
  const pnByNumber = new Map<number, PnDistrictResult>();
  if (pnLive) for (const d of pnLive.districts) pnByNumber.set(d.number, d);

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
              {data.proportionalitySeats > 0 ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1.5 text-sm font-semibold text-sky-800 dark:text-sky-300">
                  {t("elected.prop.tally", { count: data.proportionalitySeats })}
                </p>
              ) : null}
              {data.casualSeats > 0 ? (
                <p
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300"
                  title={t("elected.casual.explainer")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("elected.casual.tally", { count: data.casualSeats })}
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
            <p className="mt-1 text-xs text-muted-foreground">
              {t("elected.byParty.subtitle")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.byParty.map((p) => (
                <span
                  key={p.slug}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground"
                  title={
                    p.seats !== p.count
                      ? t("elected.byParty.tooltip", { seats: p.seats, unique: p.count })
                      : undefined
                  }
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
                    {p.seats}
                  </span>
                  {p.propSeats > 0 ? (
                    <span
                      className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300"
                      title={t("elected.prop.badge")}
                    >
                      +{p.propSeats} {t("elected.prop.short")}
                    </span>
                  ) : null}
                  {p.seats !== p.count ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      ({p.count} {t("elected.byParty.uniqueShort")})
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {data.elcomFirstCount && data.elcomFirstCount.ok ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {locale === "mt"
                  ? "L-ewwel għadd — Kummissjoni Elettorali"
                  : "First count votes — Electoral Commission"}
              </h2>
              {data.elcomFirstCount.publishedAt ? (
                <span className="text-[11px] text-muted-foreground">{data.elcomFirstCount.publishedAt}</span>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {locale === "mt" ? "Voti mitfugħa" : "Votes cast"}
                </p>
                <p className="mt-1 font-serif text-xl font-bold tabular-nums text-foreground">
                  {data.elcomFirstCount.votesCast?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {locale === "mt" ? "Voti validi" : "Valid votes"}
                </p>
                <p className="mt-1 font-serif text-xl font-bold tabular-nums text-foreground">
                  {data.elcomFirstCount.validVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {locale === "mt" ? "Voti invalidi" : "Invalid votes"}
                </p>
                <p className="mt-1 font-serif text-xl font-bold tabular-nums text-foreground">
                  {data.elcomFirstCount.invalidVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{locale === "mt" ? "Partit" : "Party"}</th>
                    <th className="px-3 py-2 text-right font-semibold">{locale === "mt" ? "Voti" : "Votes"}</th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.elcomFirstCount.parties]
                    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
                    .map((p) => (
                      <tr key={p.name} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">
                          {p.votes?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {p.percent != null ? `${p.percent.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {locale === "mt" ? "Sors: " : "Source: "}
              <a
                href={data.elcomFirstCount.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {locale === "mt" ? "Kummissjoni Elettorali ta' Malta" : "Electoral Commission of Malta"}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          <ElcomCandidateCountsPanel />
        </div>

        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-primary/5 p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                {locale === "mt" ? "Sperimentali" : "Experimental"}
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground sm:text-xl">
                {locale === "mt" ? "Simulatur ta' Elezzjoni Każwali" : "Casual Election Simulator"}
              </h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {locale === "mt"
                  ? "Ara min hu probabbli li jirbaħ siġġu jekk kandidat elett f'żewġ distretti jirrelinkwixxi wieħed minnhom — ibbażat fuq it-trasferimenti tal-voti."
                  : "See who is likely to take the seat if a doubly-elected candidate relinquishes one district — based on vote transfer patterns."}
              </p>
            </div>
            <Link
              to="/$lang/elected/simulator"
              params={{ lang }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              {locale === "mt" ? "Iftaħ is-simulatur" : "Open simulator"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>




        {pnLive ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Radio className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {locale === "mt" ? "Riżultati nazzjonali — l-ewwel għadd" : "National first-count results"}
                {pnLive.national.percentCounted != null ? (
                  <span className="ml-1 rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-foreground">
                    {pnLive.national.percentCounted}% {locale === "mt" ? "magħduda" : "counted"}
                  </span>
                ) : null}
              </h2>
              <PnLiveStatus generatedAt={pnLive.generatedAt} locale={locale} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Partit Nazzjonalista</p>
                <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">
                  {pnLive.national.pnPercent != null ? `${pnLive.national.pnPercent}%` : "—"}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {pnLive.national.pnVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Partit Laburista</p>
                <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">
                  {pnLive.national.plPercent != null ? `${pnLive.national.plPercent}%` : "—"}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {pnLive.national.plVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">ADPD</p>
                <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">
                  {pnLive.national.adpdVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Momentum</p>
                <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">
                  {pnLive.national.momentumVotes?.toLocaleString() ?? "—"}
                </p>
              </div>
            </div>
            {pnLive.national.totalVotes != null ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {locale === "mt" ? "Total voti magħduda: " : "Total votes counted: "}
                <span className="font-semibold tabular-nums text-foreground">{pnLive.national.totalVotes.toLocaleString()}</span>
              </p>
            ) : null}
            {pnLive.projection ? (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  TBASSIR · {locale === "mt" ? "Projezzjoni" : "Projection"}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                    PN {pnLive.projection.pnPercent ?? "—"}%
                  </span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
                    PL {pnLive.projection.plPercent ?? "—"}%
                  </span>
                  {pnLive.projection.leadParty && pnLive.projection.leadPercent != null ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        pnLive.projection.leadParty === "PL"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      }`}
                    >
                      {pnLive.projection.leadParty} +{pnLive.projection.leadPercent}%
                      {pnLive.projection.leadVotes != null
                        ? ` (+${pnLive.projection.leadVotes.toLocaleString()} ${locale === "mt" ? "voti" : "votes"})`
                        : ""}
                    </span>
                  ) : null}
                </div>
                {pnLive.projection.pnSeatPercent != null && pnLive.projection.plSeatPercent != null ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {locale === "mt" ? "Sehem ta' siġġijiet projettat" : "Projected seat share"}:{" "}
                    <span className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                      PN {pnLive.projection.pnSeatPercent}%
                    </span>{" "}·{" "}
                    <span className="font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
                      PL {pnLive.projection.plSeatPercent}%
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            <PnAttribution locale={locale} updatedAt={pnLive.updatedAt} />
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

        {data.casualNominees.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-blue-500/40 bg-blue-500/5 p-5 shadow-card ring-1 ring-blue-500/20">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800 dark:text-blue-300">
              <Star className="h-3.5 w-3.5" aria-hidden="true" />
              {locale === "mt" ? "Nomini għal elezzjoni każwali" : "Casual election nominations"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {locale === "mt"
                ? "Kandidati li ssottomettew in-nomina tagħhom għall-elezzjoni każwali li jmiss."
                : "Candidates who have submitted their nominations for the upcoming casual election."}
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.casualNominees.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/$lang/candidates/$slug"
                    params={{ lang: locale, slug: c.slug }}
                    className="group flex items-center gap-3 rounded-xl border border-blue-500/40 bg-background p-3 transition-colors hover:border-blue-500/70"
                  >
                    <CandidateAvatar
                      src={c.photo_url}
                      name={c.full_name}
                      className="h-12 w-12 rounded-full object-cover"
                      fallbackClassName="h-12 w-12 rounded-full bg-accent text-accent-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground group-hover:text-primary">
                        {c.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.party
                          ? (locale === "mt" ? c.party.name_mt : c.party.name_en) ?? c.party.name_en
                          : locale === "mt"
                            ? "Indipendenti"
                            : "Independent"}
                      </p>
                      {c.district ? (
                        <p className="mt-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                          {locale === "mt" ? "Distrett" : "District"} {c.district.number} —{" "}
                          {(locale === "mt" ? c.district.name_mt : c.district.name_en) ?? c.district.name_en}
                        </p>
                      ) : null}
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
                          {c.elected_via_proportionality ? (
                            <p
                              className="mt-0.5 ml-1 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300"
                              title={t("elected.prop.badge")}
                            >
                              {t("elected.prop.short")}
                            </p>
                          ) : null}
                          {c.elected_via_casual ? (
                            <p
                              className="mt-0.5 ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                              title={t("elected.casual.badge")}
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              {t("elected.casual.short")}
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
                {pnByNumber.get(g.number) ? (
                  <>
                    <PnDistrictBand d={pnByNumber.get(g.number)!} locale={locale} />
                    <PnAttribution locale={locale} updatedAt={pnLive?.updatedAt ?? null} />
                  </>
                ) : null}
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
