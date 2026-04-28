import {
  createFileRoute,
  ErrorComponent,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Globe, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

type PartyDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  description_en: string | null;
  description_mt: string | null;
  founded_year: number | null;
  leader_name: string | null;
  slogan_en: string | null;
  slogan_mt: string | null;
  website: string | null;
  wikipedia_url: string | null;
};

type ProposalRow = {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  source_url: string | null;
};

type CandidateRow = {
  id: string;
  slug: string;
  full_name: string;
  photo_url: string | null;
  is_incumbent: boolean;
  district: { number: number; name_en: string; name_mt: string | null } | null;
};

async function loadParty(slug: string) {
  const { data: party, error } = await supabase
    .from("parties")
    .select(
      "id, slug, name_en, name_mt, short_name, color, logo_url, cover_image_url, description_en, description_mt, founded_year, leader_name, slogan_en, slogan_mt, website, wikipedia_url",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!party) throw notFound();

  const [proposalsResult, candidatesResult] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, title_en, title_mt, description_en, description_mt, category, source_url")
      .eq("party_id", party.id)
      .eq("status", "published")
      .order("title_en", { ascending: true })
      .limit(50),
    supabase
      .from("candidates")
      .select(
        "id, slug, full_name, photo_url, is_incumbent, district:districts(number, name_en, name_mt)",
      )
      .eq("party_id", party.id)
      .eq("status", "published")
      .order("full_name", { ascending: true })
      .limit(60),
  ]);

  if (proposalsResult.error) throw proposalsResult.error;
  if (candidatesResult.error) throw candidatesResult.error;

  return {
    party: party as PartyDetail,
    proposals: (proposalsResult.data ?? []) as ProposalRow[],
    candidates: (candidatesResult.data ?? []) as CandidateRow[],
  };
}

export const Route = createFileRoute("/$lang/parties/$slug")({
  loader: ({ params }) => loadParty(params.slug),
  head: ({ params, loaderData }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const party = loaderData?.party;
    if (!party) {
      return { meta: [{ title: translate(lang, "parties.meta.title") }] };
    }
    const name = lang === "mt" && party.name_mt ? party.name_mt : party.name_en;
    const desc =
      (lang === "mt" ? party.description_mt : party.description_en) ??
      translate(lang, "parties.meta.description");
    const ogImage = party.cover_image_url ?? party.logo_url ?? undefined;
    const metaTags: Array<Record<string, string>> = [
      { title: `${name} — ${translate(lang, "site.name")}` },
      { name: "description", content: desc },
      { property: "og:title", content: name },
      { property: "og:description", content: desc },
    ];
    if (ogImage) {
      metaTags.push({ property: "og:image", content: ogImage });
      metaTags.push({ name: "twitter:image", content: ogImage });
    }
    return { meta: metaTags };
  },
  errorComponent: PartyError,
  notFoundComponent: () => <PartyNotFound />,
  component: PartyDetailPage,
});

function pickName(p: PartyDetail, locale: Locale) {
  return locale === "mt" && p.name_mt ? p.name_mt : p.name_en;
}

function PartyDetailPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const { party, proposals, candidates } = Route.useLoaderData();
  const locale = isLocale(lang) ? lang : "en";
  const name = pickName(party, locale);
  const desc = (locale === "mt" ? party.description_mt : party.description_en) ?? "";
  const slogan = locale === "mt" ? party.slogan_mt : party.slogan_en;
  const accent = party.color || "#64748b";

  return (
    <article className="bg-background">
      {/* Cover */}
      <header className="relative overflow-hidden border-b border-border">
        {party.cover_image_url ? (
          <div className="relative h-[280px] w-full md:h-[420px]">
            <img
              src={party.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-background" />
          </div>
        ) : (
          <div
            className="h-40 w-full"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
        )}

        <div className="container mx-auto max-w-6xl px-4">
          <div className="-mt-20 flex flex-col gap-6 pb-8 md:-mt-28 md:flex-row md:items-end">
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border border-border bg-background p-3 shadow-lg md:h-40 md:w-40">
              {party.logo_url ? (
                <img
                  src={party.logo_url}
                  alt={`${name} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-3xl font-bold" style={{ color: accent }}>
                  {(party.short_name || name).slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 pb-2">
              <Link
                to="/$lang/parties"
                params={{ lang: locale }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 hover:text-white md:text-foreground/80 md:hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("parties.backToList")}
              </Link>
              <h1 className="mt-2 font-serif text-3xl font-bold text-white md:text-foreground md:text-5xl">
                {name}
              </h1>
              {slogan && (
                <p className="mt-2 font-serif text-base italic text-white/90 md:text-muted-foreground md:text-lg">
                  “{slogan}”
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Body: magazine columns */}
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
          {/* Main column */}
          <div className="space-y-12">
            <section>
              <h2 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {t("parties.section.about")}
              </h2>
              <p className="mt-4 whitespace-pre-line font-serif text-lg leading-relaxed text-foreground">
                {desc || t("parties.empty")}
              </p>
            </section>

            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {t("parties.section.proposals")}
                </h2>
                <Link
                  to="/$lang/proposals"
                  params={{ lang: locale }}
                  search={{ q: "", scope: "all", party: party.id, candidate: "all", category: "all" }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t("parties.viewAllProposals")} →
                </Link>
              </div>
              {proposals.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("parties.proposals.empty")}
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {proposals.slice(0, 6).map((pr) => {
                    const title = (locale === "mt" ? pr.title_mt : pr.title_en) ?? pr.title_en;
                    const body = locale === "mt" ? pr.description_mt : pr.description_en;
                    return (
                      <li
                        key={pr.id}
                        className="rounded-lg border border-border bg-surface p-4 shadow-card"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-foreground">{title}</h3>
                          {pr.category && (
                            <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {pr.category}
                            </span>
                          )}
                        </div>
                        {body && (
                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {body}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {t("parties.section.candidates")}
                </h2>
                <Link
                  to="/$lang/candidates"
                  params={{ lang: locale }}
                  search={{ q: "", party: party.id, district: "all" }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t("parties.viewAllCandidates")} →
                </Link>
              </div>
              {candidates.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("parties.candidates.empty")}
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {candidates.slice(0, 12).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                    >
                      {c.photo_url ? (
                        <img
                          src={c.photo_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground ring-1 ring-border">
                          {c.full_name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {c.full_name}
                        </p>
                        {c.district && (
                          <p className="truncate text-xs text-muted-foreground">
                            #{c.district.number}{" "}
                            {locale === "mt" && c.district.name_mt
                              ? c.district.name_mt
                              : c.district.name_en}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div
              className="h-1.5 w-full rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <dl className="space-y-4 rounded-xl border border-border bg-surface p-5 text-sm shadow-card">
              {party.short_name && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("parties.facts.short")}
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">{party.short_name}</dd>
                </div>
              )}
              {party.founded_year && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("parties.facts.founded")}
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">{party.founded_year}</dd>
                </div>
              )}
              {party.leader_name && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("parties.facts.leader")}
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">{party.leader_name}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("parties.facts.candidates")}
                </dt>
                <dd className="mt-1 inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {candidates.length}
                </dd>
              </div>
            </dl>

            <div className="space-y-2 rounded-xl border border-border bg-surface p-5 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("parties.facts.links")}
              </p>
              {party.website && (
                <a
                  href={party.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  <span className="inline-flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    {t("parties.links.website")}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
              {party.wikipedia_url && (
                <a
                  href={party.wikipedia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  <span>{t("parties.links.wikipedia")}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}

function PartyNotFound() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale = isLocale(lang) ? lang : "en";
  return (
    <section className="container mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">
        {t("parties.notFound.title")}
      </h1>
      <p className="mt-3 text-muted-foreground">{t("parties.notFound.body")}</p>
      <Link
        to="/$lang/parties"
        params={{ lang: locale }}
        className="mt-6 inline-flex rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
      >
        {t("parties.backToList")}
      </Link>
    </section>
  );
}

function PartyError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20">
      <h1 className="font-serif text-2xl font-bold text-foreground">Failed to load party</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-6 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
      >
        Retry
      </button>
      <ErrorComponent error={error} />
    </section>
  );
}
