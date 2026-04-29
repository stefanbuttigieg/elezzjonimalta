import { createFileRoute, ErrorComponent, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Search, Trash2, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

type Candidate = {
  id: string;
  slug: string;
  full_name: string;
  bio_en: string | null;
  bio_mt: string | null;
  photo_url: string | null;
  is_incumbent: boolean;
  electoral_confirmed: boolean;
  facebook: string | null;
  twitter: string | null;
  website: string | null;
  party: { id: string; slug: string; name_en: string; name_mt: string | null; short_name: string | null; color: string | null } | null;
  district: { number: number; name_en: string; name_mt: string | null } | null;
};

type Proposal = {
  id: string;
  candidate_id: string | null;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
};

async function loadCompare() {
  const [candRes, propRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, slug, full_name, bio_en, bio_mt, photo_url, is_incumbent, electoral_confirmed, facebook, twitter, website, party:parties(id, slug, name_en, name_mt, short_name, color), district:districts!candidates_primary_district_id_fkey(number, name_en, name_mt)",
      )
      .eq("status", "published")
      .order("full_name", { ascending: true }),
    supabase
      .from("proposals")
      .select("id, candidate_id, title_en, title_mt, description_en, description_mt, category")
      .eq("status", "published")
      .not("candidate_id", "is", null),
  ]);
  if (candRes.error) throw candRes.error;
  if (propRes.error) throw propRes.error;
  return {
    candidates: (candRes.data ?? []) as unknown as Candidate[],
    proposals: (propRes.data ?? []) as Proposal[],
  };
}

const compareSearchSchema = z.object({
  ids: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/$lang/compare")({
  validateSearch: zodValidator(compareSearchSchema),
  loader: () => loadCompare(),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "compare.meta.title");
    const description = translate(lang, "compare.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: CompareError,
  component: ComparePage,
});

const MAX = 4;

function partyName(p: Candidate["party"], locale: Locale): string {
  if (!p) return "";
  return locale === "mt" && p.name_mt ? p.name_mt : p.name_en;
}
function districtLabel(d: Candidate["district"], locale: Locale): string {
  if (!d) return "—";
  const name = locale === "mt" && d.name_mt ? d.name_mt : d.name_en;
  return `${d.number} · ${name}`;
}
function bio(c: Candidate, locale: Locale): string {
  return (locale === "mt" ? c.bio_mt : c.bio_en) ?? "";
}
function proposalTitle(p: Proposal, locale: Locale): string {
  return (locale === "mt" && p.title_mt) || p.title_en;
}
function proposalDesc(p: Proposal, locale: Locale): string {
  return (locale === "mt" ? p.description_mt : p.description_en) ?? "";
}

function ComparePage() {
  const t = useT();
  const navigate = useNavigate({ from: "/$lang/compare" });
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const { candidates, proposals } = Route.useLoaderData() as {
    candidates: Candidate[];
    proposals: Proposal[];
  };
  const locale = isLocale(lang) ? lang : "en";

  const selectedIds = useMemo<string[]>(
    () => (search.ids ? search.ids.split(",").filter(Boolean).slice(0, MAX) : []),
    [search.ids],
  );
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean) as Candidate[];

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const setIds = (ids: string[]) => {
    void navigate({
      search: { ids: ids.length ? ids.join(",") : "" },
      replace: true,
    });
  };
  const add = (id: string) => {
    if (selectedIds.includes(id) || selectedIds.length >= MAX) return;
    setIds([...selectedIds, id]);
    setQuery("");
  };
  const remove = (id: string) => setIds(selectedIds.filter((x) => x !== id));
  const clear = () => setIds([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter((c) => !selectedIds.includes(c.id) && c.full_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [candidates, query, selectedIds]);

  const proposalsByCandidate = useMemo(() => {
    const m = new Map<string, Proposal[]>();
    for (const p of proposals) {
      if (!p.candidate_id) continue;
      const arr = m.get(p.candidate_id) ?? [];
      arr.push(p);
      m.set(p.candidate_id, arr);
    }
    return m;
  }, [proposals]);

  const copyLink = async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-10 md:py-14">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("compare.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("compare.subtitle")}
          </p>
        </header>

        {/* Picker */}
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">{t("compare.pick")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("compare.pickHint")}</p>
            </div>
            {selected.length > 0 && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("compare.shareCopied") : t("compare.share")}
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("compare.clear")}
                </button>
              </div>
            )}
          </div>

          <div className="relative mt-4">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("compare.searchPlaceholder")}
              disabled={selected.length >= MAX}
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            {selected.length >= MAX && (
              <p className="mt-2 text-xs text-muted-foreground">{t("compare.full")}</p>
            )}
            {query.trim() && filtered.length === 0 && selected.length < MAX && (
              <p className="mt-2 text-xs text-muted-foreground">{t("compare.noResults")}</p>
            )}
            {filtered.length > 0 && (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => add(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {c.photo_url ? (
                          <img
                            src={c.photo_url}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                            loading="lazy"
                          />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                        )}
                        <span className="truncate font-medium text-foreground">{c.full_name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {partyName(c.party, locale) || t("compare.independent")}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        {t("compare.add")} <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Comparison grid */}
        {selected.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-muted-foreground">
            {t("compare.empty")}
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <div
              className="grid min-w-full gap-4"
              style={{
                gridTemplateColumns: `repeat(${selected.length}, minmax(260px, 1fr))`,
              }}
            >
              {selected.map((c) => {
                const accent = c.party?.color || "#64748b";
                const cBio = bio(c, locale);
                const cProps = proposalsByCandidate.get(c.id) ?? [];
                return (
                  <article
                    key={c.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
                  >
                    <div className="h-1.5 w-full" style={{ backgroundColor: accent }} aria-hidden="true" />
                    <div className="flex items-start gap-3 px-4 pt-4">
                      {c.photo_url ? (
                        <img
                          src={c.photo_url}
                          alt={c.full_name}
                          className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-border"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-muted-foreground">
                          {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-serif text-base font-bold text-foreground">{c.full_name}</h3>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {partyName(c.party, locale) || t("compare.independent")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        aria-label={t("compare.remove")}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <dl className="mt-4 space-y-3 px-4 text-sm">
                      <Field label={t("compare.field.party")}>
                        {c.party ? (
                          <Link
                            to="/$lang/parties/$slug"
                            params={{ lang: locale, slug: c.party.slug }}
                            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: accent }}
                              aria-hidden="true"
                            />
                            {partyName(c.party, locale)}
                          </Link>
                        ) : (
                          <span className="text-foreground">{t("compare.independent")}</span>
                        )}
                      </Field>
                      <Field label={t("compare.field.district")}>
                        <span className="text-foreground">{districtLabel(c.district, locale)}</span>
                      </Field>
                      <Field label={t("compare.field.incumbent")}>
                        <Bool value={c.is_incumbent} t={t} />
                      </Field>
                      <Field label={t("compare.field.confirmed")}>
                        <Bool value={c.electoral_confirmed} t={t} />
                      </Field>
                    </dl>

                    <div className="mt-4 border-t border-border px-4 py-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("compare.field.bio")}
                      </h4>
                      <p className="mt-1.5 line-clamp-6 text-sm leading-relaxed text-foreground">
                        {cBio || <span className="text-muted-foreground">{t("compare.noBio")}</span>}
                      </p>
                    </div>

                    <div className="border-t border-border px-4 py-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("compare.field.proposals")}
                      </h4>
                      {cProps.length === 0 ? (
                        <p className="mt-1.5 text-sm text-muted-foreground">{t("compare.noProposals")}</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {cProps.slice(0, 5).map((p) => (
                            <li key={p.id} className="rounded-md border border-border bg-background p-2">
                              <p className="text-sm font-semibold text-foreground">{proposalTitle(p, locale)}</p>
                              {proposalDesc(p, locale) && (
                                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                                  {proposalDesc(p, locale)}
                                </p>
                              )}
                              {p.category && (
                                <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {p.category}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {(c.facebook || c.twitter || c.website) && (
                      <div className="border-t border-border px-4 py-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("compare.field.links")}
                        </h4>
                        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                          {c.website && (
                            <li>
                              <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-accent">
                                Website <ExternalLink className="h-3 w-3" />
                              </a>
                            </li>
                          )}
                          {c.facebook && (
                            <li>
                              <a href={c.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-accent">
                                Facebook <ExternalLink className="h-3 w-3" />
                              </a>
                            </li>
                          )}
                          {c.twitter && (
                            <li>
                              <a href={c.twitter} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-accent">
                                X / Twitter <ExternalLink className="h-3 w-3" />
                              </a>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="mt-auto border-t border-border bg-background/50 px-4 py-3">
                      <Link
                        to="/$lang/candidates/$slug"
                        params={{ lang: locale, slug: c.slug }}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                      >
                        {t("compare.viewProfile")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-sm">{children}</dd>
    </div>
  );
}

function Bool({ value, t }: { value: boolean; t: (k: string) => string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
      <Check className="h-3 w-3" />
      {t("compare.yes")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      {t("compare.no")}
    </span>
  );
}

function CompareError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20">
      <h1 className="font-serif text-2xl font-bold text-foreground">Failed to load compare</h1>
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
