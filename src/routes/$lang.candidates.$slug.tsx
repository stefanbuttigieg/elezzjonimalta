import {
  createFileRoute,
  ErrorComponent,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  Facebook,
  FileText,
  Globe,
  Landmark,
  MessageCircle,
  Newspaper,
  Sparkles,
  Twitter,
  UserRound,
  Users,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

type PartyRef = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
};

type DistrictRef = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
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

type CandidateDetail = {
  id: string;
  slug: string;
  full_name: string;
  bio_en: string | null;
  bio_mt: string | null;
  photo_url: string | null;
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  parlament_mt_url: string | null;
  source_url: string | null;
  is_incumbent: boolean;
  electoral_confirmed: boolean;
  updated_at: string;
  party: PartyRef | null;
  district: DistrictRef | null;
};

type SourceKind = "official" | "manifesto" | "news" | "social" | "other";

type CandidateSource = {
  id: string;
  kind: SourceKind;
  label: string;
  url: string;
  publisher: string | null;
  note_en: string | null;
  note_mt: string | null;
  retrieved_at: string;
  updated_at: string;
};

async function loadCandidate(slug: string) {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, slug, full_name, bio_en, bio_mt, photo_url, website, facebook, twitter, parlament_mt_url, source_url, is_incumbent, electoral_confirmed, updated_at, party:parties(id, slug, name_en, name_mt, short_name, color), district:districts!candidates_primary_district_id_fkey(id, number, name_en, name_mt)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound();

  const candidate = data as CandidateDetail;

  const [proposalsRes, sourcesRes] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, title_en, title_mt, description_en, description_mt, category, source_url")
      .eq("candidate_id", candidate.id)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_sources")
      .select("id, kind, label, url, publisher, note_en, note_mt, retrieved_at, updated_at")
      .eq("candidate_id", candidate.id)
      .order("retrieved_at", { ascending: false }),
  ]);

  if (proposalsRes.error) throw proposalsRes.error;
  if (sourcesRes.error) throw sourcesRes.error;

  return {
    candidate,
    proposals: (proposalsRes.data ?? []) as ProposalRow[],
    sources: (sourcesRes.data ?? []) as CandidateSource[],
  };
}

export const Route = createFileRoute("/$lang/candidates/$slug")({
  loader: ({ params }) => loadCandidate(params.slug),
  head: ({ params, loaderData }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const candidate = loaderData?.candidate;
    const name = candidate?.full_name ?? translate(lang, "candidates.title");
    const title = `${name} — Vot Malta 2026`;
    const bio =
      lang === "mt"
        ? candidate?.bio_mt || candidate?.bio_en
        : candidate?.bio_en || candidate?.bio_mt;
    const description = bio?.slice(0, 160) ?? translate(lang, "candidates.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(candidate?.photo_url
          ? [
              { property: "og:image", content: candidate.photo_url },
              { property: "twitter:image", content: candidate.photo_url },
            ]
          : []),
      ],
    };
  },
  errorComponent: CandidateError,
  notFoundComponent: CandidateNotFound,
  component: CandidatePage,
});

function CandidatePage() {
  const t = useT();
  const { lang } = Route.useParams();
  const { candidate, proposals, sources } = Route.useLoaderData();
  const locale: Locale = isLocale(lang) ? lang : "en";

  const bio =
    locale === "mt" ? candidate.bio_mt || candidate.bio_en : candidate.bio_en || candidate.bio_mt;

  // Merge structured sources + legacy single-link fallbacks into a unified audit list.
  const auditSources = buildAuditSources(candidate, sources);
  const lastUpdated = computeLastUpdated(candidate, sources);

  return (
    <article className="border-b border-border bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-10 md:py-14">
        <Link
          to="/$lang/candidates"
          params={{ lang: locale }}
          search={{ q: "", party: "all", district: "all" }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("candidate.back")}
        </Link>

        <header className="mt-6 grid gap-6 md:grid-cols-[180px_1fr] md:items-start">
          {candidate.photo_url ? (
            <img
              src={candidate.photo_url}
              alt={candidate.full_name}
              className="h-44 w-44 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
              <UserRound className="h-16 w-16" />
            </div>
          )}

          <div>
            <h1 className="font-serif text-4xl font-bold leading-tight text-foreground md:text-5xl">
              {candidate.full_name}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {[
                candidate.party ? partyName(candidate.party, locale) : null,
                candidate.district ? districtName(candidate.district, locale) : null,
              ]
                .filter(Boolean)
                .join(" · ") || t("candidates.unassigned")}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {candidate.is_incumbent ? <Pill label={t("common.sittingMp")} /> : null}
              {candidate.electoral_confirmed ? (
                <Pill label={t("common.electoralConfirmed")} />
              ) : null}
              {candidate.party ? (
                <Link
                  to="/$lang/parties/$slug"
                  params={{ lang: locale, slug: candidate.party.slug }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {partyName(candidate.party, locale)}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to="/$lang/ask"
                params={{ lang: locale }}
                search={{ q: t("candidate.askPrefill", { name: candidate.full_name }) }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                {t("candidate.askAi")}
              </Link>
              {candidate.website ? (
                <SocialLink href={candidate.website} label="Website" icon={Globe} />
              ) : null}
              {candidate.facebook ? (
                <SocialLink href={candidate.facebook} label="Facebook" icon={Facebook} />
              ) : null}
              {candidate.twitter ? (
                <SocialLink href={candidate.twitter} label="X / Twitter" icon={Twitter} />
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-10 grid gap-8 md:grid-cols-[1fr_280px]">
          <div className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl font-bold text-foreground">
                {t("candidate.section.bio")}
              </h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {bio || t("candidates.bio.empty")}
              </p>
            </div>

            <div>
              <h2 className="font-serif text-2xl font-bold text-foreground">
                {t("candidate.section.proposals")}
              </h2>
              {proposals.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {proposals.map((p: ProposalRow) => {
                    const title =
                      locale === "mt" ? p.title_mt || p.title_en : p.title_en || p.title_mt;
                    const desc =
                      locale === "mt"
                        ? p.description_mt || p.description_en
                        : p.description_en || p.description_mt;
                    return (
                      <li
                        key={p.id}
                        className="rounded-lg border border-border bg-surface p-4 shadow-card"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-foreground">{title}</h3>
                          {p.category ? (
                            <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {p.category}
                            </span>
                          ) : null}
                        </div>
                        {desc ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {desc}
                          </p>
                        ) : null}
                        {p.source_url ? (
                          <a
                            href={p.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                          >
                            {t("proposals.viewSource")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("candidate.proposals.empty")}
                </p>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <AuditTrail
              sources={auditSources}
              lastUpdated={lastUpdated}
              locale={locale}
              t={t}
            />
          </aside>
        </section>
      </div>
    </article>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">
      <BadgeCheck className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function SocialLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Globe;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function partyName(party: PartyRef, locale: Locale) {
  return locale === "mt"
    ? party.name_mt || party.name_en
    : party.name_en || party.name_mt || party.slug;
}

function districtName(district: DistrictRef, locale: Locale) {
  const name =
    locale === "mt" ? district.name_mt || district.name_en : district.name_en || district.name_mt;
  return `${district.number} · ${name}`;
}

function CandidateError({ error, reset }: { error: Error; reset: () => void }) {
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

function CandidateNotFound() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground">
        {t("candidate.notFound.title")}
      </h1>
      <p className="mt-3 text-muted-foreground">{t("candidate.notFound.body")}</p>
      <Link
        to="/$lang/candidates"
        params={{ lang: locale }}
        search={{ q: "", party: "all", district: "all" }}
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t("candidate.back")}
      </Link>
    </section>
  );
}
