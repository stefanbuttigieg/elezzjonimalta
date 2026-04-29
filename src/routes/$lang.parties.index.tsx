import { createFileRoute, ErrorComponent, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

type PartyCard = {
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
  website: string | null;
};

async function loadParties() {
  const { data, error } = await supabase
    .from("parties")
    .select(
      "id, slug, name_en, name_mt, short_name, color, logo_url, cover_image_url, description_en, description_mt, founded_year, leader_name, website",
    )
    .eq("status", "published")
    .order("name_en", { ascending: true });
  if (error) throw error;
  return { parties: (data ?? []) as PartyCard[] };
}

export const Route = createFileRoute("/$lang/parties")({
  loader: () => loadParties(),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "parties.meta.title");
    const description = translate(lang, "parties.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: PartiesError,
  component: PartiesPage,
});

function partyName(party: { name_en: string; name_mt: string | null }, locale: Locale) {
  return locale === "mt" && party.name_mt ? party.name_mt : party.name_en;
}

function partyDescription(
  party: { description_en: string | null; description_mt: string | null },
  locale: Locale,
) {
  return (locale === "mt" ? party.description_mt : party.description_en) ?? "";
}

function PartiesPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const { parties } = Route.useLoaderData();
  const locale = isLocale(lang) ? lang : "en";

  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("parties.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("parties.subtitle")}
          </p>
        </div>

        {parties.length === 0 ? (
          <p className="mt-12 text-sm text-muted-foreground">{t("parties.empty")}</p>
        ) : (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {parties.map((p: PartyCard) => {
              const name = partyName(p, locale);
              const desc = partyDescription(p, locale);
              const accent = p.color || "#64748b";
              return (
                <li key={p.id}>
                  <Link
                    to="/$lang/parties/$slug"
                    params={{ lang: locale, slug: p.slug }}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-all hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div
                      className="h-2 w-full"
                      style={{ backgroundColor: accent }}
                      aria-hidden="true"
                    />
                    <div className="flex items-center gap-4 px-5 pt-5">
                      {p.logo_url ? (
                        <img
                          src={p.logo_url}
                          alt={`${name} logo`}
                          className="h-14 w-14 shrink-0 rounded-md bg-background object-contain p-1.5 ring-1 ring-border"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-lg font-bold text-white"
                          style={{ backgroundColor: accent }}
                          aria-hidden="true"
                        >
                          {(p.short_name || name).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="truncate font-serif text-lg font-bold text-foreground">
                          {name}
                        </h2>
                        {p.short_name && p.short_name !== name && (
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            {p.short_name}
                            {p.founded_year ? ` · ${t("parties.foundedShort")} ${p.founded_year}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-3 px-5 text-sm leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t border-border bg-background/50 px-5 py-3 text-sm font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1.5 group-hover:text-primary">
                        {t("parties.viewProfile")}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                      {p.leader_name && (
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {p.leader_name}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function PartiesError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20">
      <h1 className="font-serif text-2xl font-bold text-foreground">Failed to load parties</h1>
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
