import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Users, Link2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { formatUpdatedAt } from "@/lib/formatDate";

export const Route = createFileRoute("/$lang/community-proposals")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "Proposti mill-Komunità · Elezzjoni Malta 2026"
        : "Proposals from the Community · Malta Election 2026";
    const description =
      lang === "mt"
        ? "Lista ta' xewqat elettorali minn NGOs, individwi u entitajiet oħra, marbuta mal-proposti tal-partiti."
        : "Election wishlists from NGOs, individuals and other entities, linked to existing party proposals.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: CommunityProposalsPage,
});

const KIND_LABEL_EN: Record<string, string> = {
  individual: "Individual",
  ngo: "NGO",
  union: "Union",
  business: "Business",
  academic: "Academic",
  faith: "Faith group",
  other: "Other",
};
const KIND_LABEL_MT: Record<string, string> = {
  individual: "Individwu",
  ngo: "NGO",
  union: "Trade Union",
  business: "Negozju",
  academic: "Akkademiku",
  faith: "Grupp ta' Fidi",
  other: "Ieħor",
};

type Author = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  bio_en: string | null;
  bio_mt: string | null;
  logo_url: string | null;
  website: string | null;
};

type CommunityProp = {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  source_url: string | null;
  updated_at: string;
  author: Author | null;
  links: {
    party_proposal: {
      id: string;
      title_en: string;
      title_mt: string | null;
      party: { slug: string; name_en: string; name_mt: string | null; short_name: string | null; color: string | null } | null;
    } | null;
  }[];
};

function CommunityProposalsPage() {
  const params = Route.useParams();
  const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
  const isMt = lang === "mt";
  const [items, setItems] = useState<CommunityProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAuthor, setFilterAuthor] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("community_proposals")
        .select(
          "id,title_en,title_mt,description_en,description_mt,category,source_url," +
            "author:community_authors(id,slug,name,kind,bio_en,bio_mt,logo_url,website)," +
            "links:community_proposal_links(party_proposal:proposals(id,title_en,title_mt,party:parties(slug,name_en,name_mt,short_name,color)))",
        )
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) console.error(error);
      // Filter out items whose author isn't published (RLS already filters but defensive).
      const list = (data ?? []).filter((r) => (r as unknown as CommunityProp).author) as unknown as CommunityProp[];
      setItems(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authors = useMemo(() => {
    const m = new Map<string, Author>();
    for (const r of items) if (r.author) m.set(r.author.id, r.author);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(
    () => (filterAuthor === "all" ? items : items.filter((r) => r.author?.id === filterAuthor)),
    [items, filterAuthor],
  );

  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {isMt ? "Vuċi tas-soċjetà ċivili" : "Voices from civil society"}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {isMt ? "Proposti mill-Komunità" : "Proposals from the Community"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {isMt
              ? "Lista ta' xewqat elettorali ppubblikati minn NGOs, individwi u entitajiet oħra. Fejn possibbli, kull proposta hija marbuta mal-proposti tal-partiti li jaqblu magħha."
              : "Election wishlists published by NGOs, individuals and other entities. Where possible, each one is linked to existing party proposals it aligns with."}
          </p>
          <div className="mt-4">
            <Link
              to="/$lang/proposals"
              params={{ lang }}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {isMt ? "← Ara l-proposti tal-partiti" : "← Browse party proposals"}
            </Link>
          </div>
        </header>

        {!loading && authors.length > 0 ? (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Filter className="h-3 w-3" /> {isMt ? "Awtur" : "Author"}
            </span>
            <button
              onClick={() => setFilterAuthor("all")}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (filterAuthor === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent")
              }
            >
              {isMt ? "Kollha" : "All"} ({items.length})
            </button>
            {authors.map((a) => (
              <button
                key={a.id}
                onClick={() => setFilterAuthor(a.id)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (filterAuthor === a.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent")
                }
              >
                {a.name}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">…</p>
        ) : filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {isMt
                ? "Għadhom ma ġewx ippubblikati proposti mill-komunità."
                : "No community proposals have been published yet."}
            </p>
          </div>
        ) : (
          <ul className="mt-10 space-y-5">
            {filtered.map((r) => {
              const title = isMt && r.title_mt ? r.title_mt : r.title_en;
              const desc = isMt && r.description_mt ? r.description_mt : r.description_en;
              const author = r.author;
              const kindLabel = author
                ? (isMt ? KIND_LABEL_MT : KIND_LABEL_EN)[author.kind] ?? author.kind
                : "";
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                        {author?.logo_url ? (
                          <img
                            src={author.logo_url}
                            alt=""
                            className="h-12 w-12 rounded-xl object-cover"
                          />
                        ) : (
                          <Users className="h-6 w-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {kindLabel}
                        </p>
                        <p className="font-serif text-lg font-bold text-foreground">{author?.name}</p>
                        {author?.website ? (
                          <a
                            href={author.website}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {author.website.replace(/^https?:\/\/(www\.)?/, "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {r.category ? (
                      <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {r.category}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-5 font-serif text-2xl font-bold leading-tight text-foreground">
                    {title}
                  </h3>
                  {desc ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  ) : null}

                  {r.source_url ? (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {isMt ? "Sors" : "Source"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}

                  {r.links.length > 0 ? (
                    <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        {isMt
                          ? `Marbuta ma' ${r.links.length} propost${r.links.length === 1 ? "a" : "i"} tal-partiti`
                          : `Linked to ${r.links.length} party proposal${r.links.length === 1 ? "" : "s"}`}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {r.links.map((l, idx) =>
                          l.party_proposal ? (
                            <li key={idx} className="flex items-start gap-2">
                              {l.party_proposal.party ? (
                                <span
                                  className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold text-white"
                                  style={{ backgroundColor: l.party_proposal.party.color ?? "#666" }}
                                >
                                  {l.party_proposal.party.short_name ??
                                    (isMt && l.party_proposal.party.name_mt
                                      ? l.party_proposal.party.name_mt
                                      : l.party_proposal.party.name_en)}
                                </span>
                              ) : null}
                              <span className="text-sm text-foreground">
                                {isMt && l.party_proposal.title_mt
                                  ? l.party_proposal.title_mt
                                  : l.party_proposal.title_en}
                              </span>
                            </li>
                          ) : null,
                        )}
                      </ul>
                      <Link
                        to="/$lang/proposals"
                        params={{ lang }}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {isMt ? "Iftaħ il-proposti tal-partiti" : "Open party proposals"} →
                      </Link>
                    </div>
                  ) : (
                    <p className="mt-5 text-xs italic text-muted-foreground">
                      {isMt
                        ? "Għadha mhix marbuta ma' ebda propost tal-partiti."
                        : "Not yet linked to any party proposal."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
