import { createFileRoute, Link } from "@tanstack/react-router";
import { setEdgeCacheHeader } from "@/lib/ssrCache";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Map as MapIcon,
  Users,
  Landmark,
  GitCompareArrows,
  Sparkles,
  Code2,
  ShieldCheck,
  BookOpen,
  Languages,
  Database,
  FileText,
  MapPin,
  CheckCircle2,
  ExternalLink,
  X,
  BarChart3,
  Flag,
  HelpCircle,
  CalendarDays,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n/useT";
import { translate } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { LocalityPicker } from "@/components/site/LocalityPicker";
import { LazyMaltaDistrictsMap } from "@/components/site/LazyMaltaDistrictsMap";
import { formatUpdatedAt } from "@/lib/formatDate";
import {
  clearPreferredDistrict,
  getPreferredDistrict,
  type PreferredDistrict,
} from "@/lib/preferredDistrict";

const ELECTION_DATE_ISO = "2026-05-30T07:00:00+02:00";

type ElectedSummary = {
  total: number;
  districtsWithResults: number;
  byParty: Array<{
    slug: string;
    short_name: string | null;
    name_en: string;
    name_mt: string | null;
    color: string | null;
    count: number;
  }>;
  recent: Array<{
    slug: string;
    full_name: string;
    photo_url: string | null;
    district_number: number;
    district_name_en: string;
    district_name_mt: string | null;
    party_short: string | null;
    party_name_en: string | null;
    party_name_mt: string | null;
    party_color: string | null;
  }>;
};

type LandingStats = {
  candidates: number;
  parties: number;
  proposals: number;
  districts: number;
  sittingMps: number;
  faqs: number;
  districtCandidateCounts: Record<number, number>;
  lastUpdated: string | null;
  elected: ElectedSummary;
};

async function loadLandingStats(): Promise<LandingStats> {
  const head = { count: "exact" as const, head: true };
  const [candidates, parties, proposals, districts, sittingMps, faqs, districtRows, candDistricts, latestCandidate, latestProposal, latestParty, latestDistrict, latestFaq] =
    await Promise.all([
      supabase.from("candidates").select("id", head).eq("status", "published").eq("electoral_confirmed", true),
      supabase.from("parties").select("id", head).eq("status", "published"),
      supabase.from("proposals").select("id", head).eq("status", "published").is("merged_into_id", null),
      supabase.from("districts").select("id", head).eq("status", "published"),
      supabase.from("candidates").select("id", head).eq("is_incumbent", true),
      supabase.from("voting_faqs").select("id", head).eq("status", "published"),
      supabase.from("districts").select("id, number").eq("status", "published"),
      supabase
        .from("candidate_districts")
        .select("district_id, candidate:candidates!inner(status, electoral_confirmed)")
        .eq("election_year", 2026)
        .eq("candidate.status", "published")
        .eq("candidate.electoral_confirmed", true),
      supabase.from("candidates").select("updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("proposals").select("updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("parties").select("updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("districts").select("updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("voting_faqs").select("updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const numberById: Record<string, number> = {};
  for (const d of (districtRows.data ?? []) as Array<{ id: string; number: number }>) {
    numberById[d.id] = d.number;
  }
  const districtCandidateCounts: Record<number, number> = {};
  for (const row of (candDistricts.data ?? []) as Array<{ district_id: string }>) {
    const num = numberById[row.district_id];
    if (num == null) continue;
    districtCandidateCounts[num] = (districtCandidateCounts[num] ?? 0) + 1;
  }

  const updates = [latestCandidate, latestProposal, latestParty, latestDistrict, latestFaq]
    .map((r) => (r.data as { updated_at: string } | null)?.updated_at)
    .filter((v): v is string => Boolean(v));
  const lastUpdated = updates.length
    ? updates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null;

  // Elected summary for the homepage feature.
  const elected = await loadElectedSummary();

  return {
    candidates: candidates.count ?? 0,
    parties: parties.count ?? 0,
    proposals: proposals.count ?? 0,
    districts: districts.count ?? 0,
    sittingMps: sittingMps.count ?? 0,
    faqs: faqs.count ?? 0,
    districtCandidateCounts,
    lastUpdated,
    elected,
  };
}

async function loadElectedSummary(): Promise<ElectedSummary> {
  const { data } = await supabase
    .from("candidate_districts")
    .select(
      "votes_first_count, updated_at, candidate:candidates(slug, full_name, photo_url, party:parties(slug, short_name, name_en, name_mt, color)), district:districts(number, name_en, name_mt)"
    )
    .eq("election_year", 2026)
    .eq("elected", true);

  type Row = {
    votes_first_count: number | null;
    updated_at: string | null;
    candidate: {
      slug: string;
      full_name: string;
      photo_url: string | null;
      party: {
        slug: string;
        short_name: string | null;
        name_en: string;
        name_mt: string | null;
        color: string | null;
      } | null;
    } | null;
    district: { number: number; name_en: string; name_mt: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const districts = new Set<number>();
  type PartyTally = ElectedSummary["byParty"][number];
  const partyMap = new Map<string, PartyTally>();
  const items: Array<Row & { sortKey: number }> = [];
  const seenCandidates = new Set<string>();
  const candidateDistricts = new Map<string, Set<number>>();

  for (const r of rows) {
    if (!r.candidate || !r.district) continue;
    districts.add(r.district.number);
    items.push({ ...r, sortKey: r.updated_at ? new Date(r.updated_at).getTime() : 0 });
    const slug = r.candidate.slug;
    const set = candidateDistricts.get(slug) ?? new Set<number>();
    set.add(r.district.number);
    candidateDistricts.set(slug, set);
    if (seenCandidates.has(slug)) continue;
    seenCandidates.add(slug);
    const p = r.candidate.party;
    const key = p?.slug ?? "__independent";
    const existing =
      partyMap.get(key) ??
      ({
        slug: key,
        short_name: p?.short_name ?? null,
        name_en: p?.name_en ?? "Independent",
        name_mt: p?.name_mt ?? "Indipendenti",
        color: p?.color ?? null,
        count: 0,
      } as ElectedSummary["byParty"][number]);
    existing.count += 1;
    partyMap.set(key, existing);
  }

  items.sort((a, b) => b.sortKey - a.sortKey);
  const recentSeen = new Set<string>();
  const recent = items
    .filter((r) => {
      const s = r.candidate!.slug;
      if (recentSeen.has(s)) return false;
      recentSeen.add(s);
      return true;
    })
    .slice(0, 8)
    .map((r) => ({
      slug: r.candidate!.slug,
      full_name: r.candidate!.full_name,
      photo_url: r.candidate!.photo_url,
      district_number: r.district!.number,
      district_name_en: r.district!.name_en,
      district_name_mt: r.district!.name_mt,
      party_short: r.candidate!.party?.short_name ?? null,
      party_name_en: r.candidate!.party?.name_en ?? null,
      party_name_mt: r.candidate!.party?.name_mt ?? null,
      party_color: r.candidate!.party?.color ?? null,
      district_count: candidateDistricts.get(r.candidate!.slug)?.size ?? 1,
    }));

  const multiDistrict = Array.from(candidateDistricts.values()).filter((s) => s.size > 1).length;

  return {
    total: seenCandidates.size,
    districtsWithResults: districts.size,
    byParty: Array.from(partyMap.values()).sort((a, b) => b.count - a.count),
    recent,
    multiDistrict,
  };
}

export const Route = createFileRoute("/$lang/")({
  loader: async () => {
    // Edge-cache the SSR'd HTML for a short window. createIsomorphicFn keeps
    // the response-header call server-only while staying safe to import here.
    setEdgeCacheHeader("public, s-maxage=60, stale-while-revalidate=300");
    return loadLandingStats().catch(() => null);
  },
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "Elezzjoni — Ivvota b'għarfien"
        : "Elezzjoni — Make an informed vote";
    const description = translate(lang, "site.description");
    const url = `https://elezzjoni.app/${lang}`;
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
  component: HomePage,
});

function HomePage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const stats = Route.useLoaderData();
  const [preferred, setPreferred] = useState<PreferredDistrict | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferred(getPreferredDistrict());
    setHydrated(true);
  }, []);

  return (
    <>
      {hydrated && preferred ? (
        <div className="border-b border-border bg-primary/5">
          <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              {t("home.welcomeBack", {
                number: preferred.number,
                locality: preferred.locality ?? "",
              })}
            </p>
            <div className="flex items-center gap-2">
              <Link
                to="/$lang/my-district/$number"
                params={{ lang: locale, number: String(preferred.number) }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {t("home.welcomeBack.cta")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearPreferredDistrict();
                  setPreferred(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                aria-label={t("home.welcomeBack.clear")}
              >
                <X className="h-3 w-3" />
                {t("home.welcomeBack.clear")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Hero lang={locale} t={t} />
      {stats?.elected && stats.elected.total > 0 ? (
        <ElectedHighlight lang={locale} t={t} elected={stats.elected} />
      ) : null}
      <EligibilitySection t={t} />
      <StatsSection stats={stats} lang={locale} t={t} />
      <DistrictsMapSection lang={locale} t={t} candidateCounts={stats?.districtCandidateCounts} />
      <Principles t={t} />
      <EntryGrid lang={locale} t={t} />
    </>
  );
}

function EligibilitySection({
  t,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <section className="border-b border-border bg-surface">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="flex flex-col gap-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-card md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("home.eligibility.eyebrow")}
              </p>
              <h2 className="mt-1 font-serif text-2xl font-bold text-foreground md:text-3xl">
                {t("home.eligibility.title")}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                {t("home.eligibility.desc")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("home.eligibility.note")}
              </p>
            </div>
          </div>
          <a
            href="https://electoral.gov.mt/electoral-registers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {t("home.eligibility.cta")}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Hero({
  lang,
  t,
}: {
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-surface to-background">
      {/* Animated aurora glows behind hero */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <div
          className="hero-aurora absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/25 blur-3xl"
        />
        <div
          className="hero-aurora absolute -bottom-32 right-[-10%] h-[360px] w-[360px] rounded-full bg-accent/40 blur-3xl"
          style={{ animationDelay: "-4s" }}
        />
      </div>
      <div className="container relative mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-5 md:items-center">
          <div className="md:col-span-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("home.hero.eyebrow")}
            </p>
            <h1 className="mt-3 font-serif text-4xl font-bold leading-[1.05] text-foreground md:text-6xl">
              {t("home.hero.title")}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("home.hero.subtitle")}
            </p>

            <div className="relative mt-10">
              {/* Nudging "Start here" callout */}
              <div className="hero-pin-bob pointer-events-none absolute -top-7 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground shadow-elevated">
                <MapPin className="h-3 w-3" />
                {lang === "mt" ? "Ibda hawn" : "Start here"}
              </div>
              {/* Pulsing focus ring around the picker */}
              <div className="hero-ring rounded-xl ring-1 ring-primary/30">
                <LocalityPicker lang={lang} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <Link
                to="/$lang/candidates"
                params={{ lang }}
                className="inline-flex items-center gap-1.5 font-semibold text-foreground/80 hover:text-foreground"
              >
                {t("home.hero.ctaCandidates")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link
                to="/$lang/ask"
                params={{ lang }}
                className="inline-flex items-center gap-1.5 font-semibold text-foreground/80 hover:text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("home.hero.ctaAsk")}
              </Link>
            </div>
          </div>
          <div className="md:col-span-2">
            <Countdown targetIso={ELECTION_DATE_ISO} t={t} />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSection({
  stats,
  lang,
  t,
}: {
  stats: LandingStats | null;
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const daysToGo = Math.max(
    0,
    Math.ceil((new Date(ELECTION_DATE_ISO).getTime() - Date.now()) / 86_400_000),
  );
  const items: Array<{
    icon: typeof Users;
    value: number;
    label: string;
    to?: string;
    accent?: boolean;
  }> = [
    { icon: Users, value: stats?.candidates ?? 0, label: t("home.stats.candidates"), to: `/${lang}/candidates` },
    { icon: Flag, value: stats?.parties ?? 0, label: t("home.stats.parties"), to: `/${lang}/parties` },
    { icon: FileText, value: stats?.proposals ?? 0, label: t("home.stats.proposals"), to: `/${lang}/proposals` },
    { icon: MapIcon, value: stats?.districts ?? 0, label: t("home.stats.districts"), to: `/${lang}/districts` },
    { icon: Landmark, value: stats?.sittingMps ?? 0, label: t("home.stats.sittingMps"), to: `/${lang}/sitting-mps` },
    { icon: HelpCircle, value: stats?.faqs ?? 0, label: t("home.stats.faqs"), to: `/${lang}/faq` },
    { icon: CalendarDays, value: daysToGo, label: t("home.stats.daysToGo"), accent: true },
  ];

  const fmt = new Intl.NumberFormat(lang === "mt" ? "mt-MT" : "en-MT");

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("home.stats.eyebrow")}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
            {t("home.stats.title")}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {t("home.stats.subtitle")}
          </p>
          {stats?.lastUpdated ? (
            <p
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              title={stats.lastUpdated}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {t("home.stats.lastUpdated", { date: formatUpdatedAt(stats.lastUpdated, lang) })}
            </p>
          ) : null}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                <div
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-lg " +
                    (item.accent ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground")
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div
                  className="mt-3 font-serif text-3xl font-bold tabular-nums text-foreground md:text-4xl"
                  suppressHydrationWarning
                >
                  {fmt.format(item.value)}
                </div>
                <div className="mt-1 text-xs font-medium leading-snug text-muted-foreground">
                  {item.label}
                </div>
              </>
            );
            const baseClass =
              "group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-all";
            return item.to ? (
              <Link
                key={item.label}
                to={item.to}
                className={baseClass + " hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated"}
              >
                {inner}
              </Link>
            ) : (
              <div key={item.label} className={baseClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DistrictsMapSection({
  lang,
  t,
  candidateCounts,
}: {
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
  candidateCounts?: Record<number, number>;
}) {
  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("districts.title")}
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
              {t("districts.map.title")}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {t("districts.map.subtitle")}
            </p>
          </div>
          <Link
            to="/$lang/districts"
            params={{ lang }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground"
          >
            {t("home.hero.ctaCandidates")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-6">
          <LazyMaltaDistrictsMap locale={lang} height={420} candidateCounts={candidateCounts} />
        </div>
      </div>
    </section>
  );
}

function Countdown({
  targetIso,
  t,
}: {
  targetIso: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const target = new Date(targetIso).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = now === null ? 0 : Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const passed = now !== null && diff === 0;

  const cells = [
    { value: days, label: t("home.countdown.days") },
    { value: hours, label: t("home.countdown.hours") },
    { value: minutes, label: t("home.countdown.minutes") },
    { value: seconds, label: t("home.countdown.seconds") },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t("home.countdown.label")}
      </p>
      <p className="mt-1 font-serif text-2xl font-bold text-foreground">30 · 05 · 2026</p>
      {passed ? (
        <p className="mt-4 text-sm text-foreground">{t("home.countdown.passed")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-4 gap-2">
          {cells.map((cell) => (
            <div key={cell.label} className="rounded-lg bg-secondary px-2 py-3 text-center">
              <div
                className="font-serif text-2xl font-bold tabular-nums text-foreground"
                suppressHydrationWarning
              >
                {now === null ? "--" : String(cell.value).padStart(2, "0")}
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {cell.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryGrid({
  lang,
  t,
}: {
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const items = [
    {
      to: `/${lang}/candidates`,
      icon: Users,
      title: t("candidates.title"),
      desc: t("candidates.subtitle"),
    },
    {
      to: `/${lang}/districts`,
      icon: MapIcon,
      title: t("home.entry.districts.title"),
      desc: t("home.entry.districts.desc"),
    },
    {
      to: `/${lang}/parties`,
      icon: Landmark,
      title: t("home.entry.parties.title"),
      desc: t("home.entry.parties.desc"),
    },
    {
      to: `/${lang}/proposals`,
      icon: FileText,
      title: t("proposals.title"),
      desc: t("proposals.subtitle"),
    },
    {
      to: `/${lang}/sitting-mps`,
      icon: Users,
      title: t("home.entry.sitting.title"),
      desc: t("home.entry.sitting.desc"),
    },
    {
      to: `/${lang}/compare`,
      icon: GitCompareArrows,
      title: t("home.entry.compare.title"),
      desc: t("home.entry.compare.desc"),
    },
    {
      to: `/${lang}/ask`,
      icon: Sparkles,
      title: t("home.entry.ask.title"),
      desc: t("home.entry.ask.desc"),
    },
    {
      to: `/${lang}/developers`,
      icon: Code2,
      title: t("home.entry.developers.title"),
      desc: t("home.entry.developers.desc"),
    },
  ];
  return (
    <section className="container mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col rounded-xl border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-serif text-lg font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground/70 transition-colors group-hover:text-foreground">
              {t("common.learnMore")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Principles({ t }: { t: (k: string, v?: Record<string, string | number>) => string }) {
  const items = [
    {
      icon: ShieldCheck,
      title: t("home.principles.neutral.title"),
      desc: t("home.principles.neutral.desc"),
    },
    {
      icon: BookOpen,
      title: t("home.principles.sourced.title"),
      desc: t("home.principles.sourced.desc"),
    },
    {
      icon: Languages,
      title: t("home.principles.bilingual.title"),
      desc: t("home.principles.bilingual.desc"),
    },
    {
      icon: Database,
      title: t("home.principles.open.title"),
      desc: t("home.principles.open.desc"),
    },
  ];
  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
          {t("home.principles.title")}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.title} className="flex flex-col">
              <item.icon className="h-5 w-5 text-foreground" />
              <h3 className="mt-3 text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ElectedHighlight({
  lang,
  t,
  elected,
}: {
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
  elected: ElectedSummary;
}) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-emerald-500/5 via-background to-background">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("home.elected.eyebrow")}
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
              {t("home.elected.title")}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {t("home.elected.subtitle")}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {t("home.elected.countSummary", {
                total: elected.total,
                districts: elected.districtsWithResults,
              })}
            </p>
          </div>
          <Link
            to="/$lang/elected"
            params={{ lang }}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            {t("home.elected.viewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {elected.byParty.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {elected.byParty.map((p) => (
              <span
                key={p.slug}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-foreground"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: p.color ?? "hsl(var(--muted-foreground))" }}
                  aria-hidden="true"
                />
                <span>
                  {(lang === "mt" ? p.name_mt : p.name_en) ?? p.name_en}
                  {p.short_name ? ` (${p.short_name})` : ""}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  {p.count}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {elected.recent.map((c) => (
            <li key={c.slug + c.district_number}>
              <Link
                to="/$lang/candidates/$slug"
                params={{ lang, slug: c.slug }}
                className="group flex h-full flex-col rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 ring-1 ring-emerald-500/20 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("common.elected")}
                </div>
                <p className="mt-1 font-semibold text-foreground group-hover:text-primary">
                  {c.full_name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.party_short || c.party_name_en || (lang === "mt" ? "Indipendenti" : "Independent")}
                  {" · "}
                  {t("elected.districtHeading", {
                    number: c.district_number,
                    name: (lang === "mt" ? c.district_name_mt : c.district_name_en) ?? c.district_name_en,
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
