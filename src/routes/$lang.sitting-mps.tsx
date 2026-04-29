import {
  createFileRoute,
  ErrorComponent,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Filter, RotateCcw, Search, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import { useAuth } from "@/lib/auth";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  party: fallback(z.string(), "all").default("all"),
  district: fallback(z.string(), "all").default("all"),
});

type MpRow = {
  id: string;
  full_name: string;
  slug: string;
  photo_url: string | null;
  party_id: string | null;
  primary_district_id: string | null;
  parlament_mt_url: string | null;
  status: string;
  electoral_confirmed: boolean;
  not_contesting_2026: boolean;
  not_contesting_source_url: string | null;
  not_contesting_note_en: string | null;
  not_contesting_note_mt: string | null;
};

type PartyRow = {
  id: string;
  short_name: string | null;
  name_en: string;
  name_mt: string | null;
  color: string | null;
  slug: string;
};

type DistrictRow = {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
};

async function loadSittingMps() {
  const [mpsRes, partiesRes, districtsRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, slug, photo_url, party_id, primary_district_id, parlament_mt_url, status, electoral_confirmed, not_contesting_2026, not_contesting_source_url, not_contesting_note_en, not_contesting_note_mt"
      )
      .eq("is_incumbent", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("parties")
      .select("id, short_name, name_en, name_mt, color, slug")
      .eq("status", "published")
      .order("short_name", { ascending: true }),
    supabase
      .from("districts")
      .select("id, number, name_en, name_mt")
      .eq("status", "published")
      .order("number", { ascending: true }),
  ]);

  if (mpsRes.error) throw mpsRes.error;
  if (partiesRes.error) throw partiesRes.error;
  if (districtsRes.error) throw districtsRes.error;

  return {
    mps: (mpsRes.data ?? []) as MpRow[],
    parties: (partiesRes.data ?? []) as PartyRow[],
    districts: (districtsRes.data ?? []) as DistrictRow[],
  };
}

export const Route = createFileRoute("/$lang/sitting-mps")({
  validateSearch: zodValidator(searchSchema),
  loader: () => loadSittingMps(),
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "sittingMps.meta.title");
    const description = translate(lang, "sittingMps.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: SittingMpsError,
  notFoundComponent: SittingMpsNotFound,
  component: SittingMpsPage,
});

function SittingMpsPage() {
  const t = useT();
  const router = useRouter();
  const navigate = useNavigate({ from: "/$lang/sitting-mps" });
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const { mps, parties, districts } = Route.useLoaderData() as {
    mps: MpRow[];
    parties: PartyRow[];
    districts: DistrictRow[];
  };
  const { isStaff } = useAuth();
  const locale = isLocale(lang) ? lang : "en";

  const partiesById = new Map<string, PartyRow>(parties.map((p) => [p.id, p]));
  const districtsById = new Map<string, DistrictRow>(districts.map((d) => [d.id, d]));

  const updateSearch = (patch: Partial<typeof search>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  const filtered = mps.filter((mp) => {
    if (search.party !== "all" && mp.party_id !== search.party) return false;
    if (search.district !== "all" && mp.primary_district_id !== search.district) return false;
    if (!search.q.trim()) return true;
    return mp.full_name.toLowerCase().includes(search.q.trim().toLowerCase());
  });

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("sittingMps.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("sittingMps.subtitle")}
          </p>
        </div>

        <div className="mt-8 grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("candidates.search.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(e) => updateSearch({ q: e.target.value })}
                placeholder={t("sittingMps.search.placeholder")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("sittingMps.party.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={search.party}
                onChange={(e) => updateSearch({ party: e.target.value })}
                className="w-full bg-transparent text-sm text-foreground outline-none"
              >
                <option value="all">{t("sittingMps.party.all")}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.short_name || p.name_en}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("sittingMps.district.label")}
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={search.district}
                onChange={(e) => updateSearch({ district: e.target.value })}
                className="w-full bg-transparent text-sm text-foreground outline-none"
              >
                <option value="all">{t("sittingMps.district.all")}</option>
                {districts.map((d) => {
                  const name = locale === "mt" ? d.name_mt || d.name_en : d.name_en;
                  return (
                    <option key={d.id} value={d.id}>
                      {d.number} · {name}
                    </option>
                  );
                })}
              </select>
            </span>
          </label>

          <Link
            to="/$lang/sitting-mps"
            params={{ lang: locale }}
            search={{ q: "", party: "all", district: "all" }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            {t("candidates.filters.reset") ?? "Reset"}
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          {t("sittingMps.results", { count: filtered.length })}
        </p>

        {filtered.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((mp) => (
              <MpCard
                key={mp.id}
                mp={mp}
                party={mp.party_id ? partiesById.get(mp.party_id) ?? null : null}
                district={mp.primary_district_id ? districtsById.get(mp.primary_district_id) ?? null : null}
                locale={locale}
                canManage={isStaff}
                onChanged={() => router.invalidate()}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {t("sittingMps.empty.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("sittingMps.empty.body")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function MpCard({
  mp,
  party,
  district,
  locale,
  canManage,
  onChanged,
}: {
  mp: MpRow;
  party: PartyRow | null;
  district: DistrictRow | null;
  locale: Locale;
  canManage: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const isCandidate = mp.electoral_confirmed && mp.status === "published";

  const togglePromotion = async () => {
    setBusy(true);
    try {
      const patch = isCandidate
        ? { electoral_confirmed: false, status: "draft" as const }
        : { electoral_confirmed: true, status: "published" as const };
      const { error } = await supabase.from("candidates").update(patch).eq("id", mp.id);
      if (error) throw error;
      toast.success(
        isCandidate ? t("sittingMps.demote.success") : t("sittingMps.promote.success")
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sittingMps.promote.error"));
    } finally {
      setBusy(false);
    }
  };

  const districtName = district
    ? locale === "mt"
      ? district.name_mt || district.name_en
      : district.name_en
    : null;

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-background">
          {mp.photo_url ? (
            <img src={mp.photo_url} alt={mp.full_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
              {mp.full_name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold leading-tight text-foreground">
            {mp.full_name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {party ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-white"
                style={{ backgroundColor: party.color || "hsl(var(--muted-foreground))" }}
              >
                {party.short_name || party.name_en}
              </span>
            ) : null}
            {districtName ? (
              <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 font-medium text-muted-foreground">
                {district?.number} · {districtName}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-2">
          {mp.not_contesting_2026 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-400">
              {t("sittingMps.notContesting")}
            </span>
          ) : isCandidate ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("sittingMps.alreadyCandidate")}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-dashed border-border bg-background px-2.5 py-1 font-medium text-muted-foreground">
              {t("sittingMps.notCandidate")}
            </span>
          )}
        </div>
        {mp.not_contesting_2026 ? (
          <>
            {(() => {
              const note = locale === "mt"
                ? mp.not_contesting_note_mt || mp.not_contesting_note_en
                : mp.not_contesting_note_en || mp.not_contesting_note_mt;
              return note ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
              ) : null;
            })()}
            {mp.not_contesting_source_url ? (
              <a
                href={mp.not_contesting_source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
              >
                {t("sittingMps.notContestingSource")}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        {mp.parlament_mt_url ? (
          <a
            href={mp.parlament_mt_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            parlament.mt
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span />
        )}
        {canManage ? (
          <button
            type="button"
            disabled={busy}
            onClick={togglePromotion}
            className={
              isCandidate
                ? "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                : "inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
            }
          >
            {isCandidate ? (
              <>
                <UserMinus className="h-3.5 w-3.5" />
                {t("sittingMps.demote")}
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                {t("sittingMps.promote")}
              </>
            )}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SittingMpsError({ error, reset }: { error: Error; reset: () => void }) {
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

function SittingMpsNotFound() {
  const t = useT();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold text-foreground">{t("common.notFound")}</h1>
      <p className="mt-3 text-muted-foreground">{t("notFound.body")}</p>
    </section>
  );
}
