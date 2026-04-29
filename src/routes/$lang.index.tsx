import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Map,
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
  X,
} from "lucide-react";
import { useT } from "@/i18n/useT";
import { translate } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { LocalityPicker } from "@/components/site/LocalityPicker";
import { MaltaDistrictsMap } from "@/components/site/MaltaDistrictsMap";
import {
  clearPreferredDistrict,
  getPreferredDistrict,
  type PreferredDistrict,
} from "@/lib/preferredDistrict";

const ELECTION_DATE_ISO = "2026-05-30T07:00:00+02:00";

export const Route = createFileRoute("/$lang/")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "Elezzjoni — Ivvota b'għarfien"
        : "Elezzjoni — Make an informed vote";
    const description = translate(lang, "site.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
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
      <DistrictsMapSection lang={locale} t={t} />
      <Principles t={t} />
      <EntryGrid lang={locale} t={t} />
    </>
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
      <div className="container mx-auto max-w-6xl px-4 py-16 md:py-24">
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

            <div className="mt-8">
              <LocalityPicker lang={lang} />
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

function DistrictsMapSection({
  lang,
  t,
}: {
  lang: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
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
          <MaltaDistrictsMap locale={lang} height={420} />
        </div>
      </div>
    </section>
  );
}


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
      icon: Map,
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
