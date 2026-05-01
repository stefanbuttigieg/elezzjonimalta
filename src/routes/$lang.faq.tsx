import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, HelpCircle } from "lucide-react";
import { useT, translate } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { supabase } from "@/integrations/supabase/client";

interface Faq {
  id: string;
  source_key: string;
  source_label: string;
  source_url: string;
  question_en: string;
  answer_en: string;
  question_mt: string | null;
  answer_mt: string | null;
  sort_order: number;
}

export const Route = createFileRoute("/$lang/faq")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "faq.meta.title");
    const description = translate(lang, "faq.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: FaqPage,
});

function FaqPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const [rows, setRows] = useState<Faq[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("voting_faqs")
        .select(
          "id, source_key, source_label, source_url, question_en, answer_en, question_mt, answer_mt, sort_order"
        )
        .eq("status", "published")
        .order("source_key")
        .order("sort_order");
      if (!cancelled) {
        setRows((data ?? []) as Faq[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const get = (r: Faq) => {
    if (locale === "mt" && r.question_mt && r.answer_mt) {
      return { question: r.question_mt, answer: r.answer_mt };
    }
    return { question: r.question_en, answer: r.answer_en };
  };

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      const { question, answer } = get(r);
      return (
        question.toLowerCase().includes(needle) ||
        answer.toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, locale]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; url: string; items: Faq[] }>();
    for (const r of filtered) {
      const existing = map.get(r.source_key);
      if (existing) existing.items.push(r);
      else
        map.set(r.source_key, {
          label: r.source_label,
          url: r.source_url,
          items: [r],
        });
    }
    return Array.from(map.entries());
  }, [filtered]);

  // JSON-LD FAQ schema for SEO
  const jsonLd =
    rows.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: rows.slice(0, 50).map((r) => {
            const { question, answer } = get(r);
            return {
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            };
          }),
        }
      : null;

  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("faq.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("faq.subtitle")}
          </p>
        </header>

        <div className="relative mt-8 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("faq.searchPlaceholder")}
            className="w-full rounded-md border border-border bg-surface py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t("faq.searchPlaceholder")}
          />
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : grouped.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("faq.empty")}</p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {grouped.map(([sourceKey, group]) => (
              <section key={sourceKey} aria-labelledby={`src-${sourceKey}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <h2
                    id={`src-${sourceKey}`}
                    className="font-serif text-xl font-bold text-foreground"
                  >
                    {group.label}
                  </h2>
                  <a
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("faq.viewSource")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ul className="space-y-2">
                  {group.items.map((r) => {
                    const { question, answer } = get(r);
                    const isOpen = openId === r.id;
                    return (
                      <li key={r.id}>
                        <details
                          open={isOpen}
                          onToggle={(e) => {
                            const el = e.currentTarget as HTMLDetailsElement;
                            setOpenId(el.open ? r.id : null);
                          }}
                          className="group rounded-lg border border-border bg-surface transition-colors hover:border-primary/30"
                        >
                          <summary className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3 text-left text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                            <span className="flex-1">{question}</span>
                            <span className="mt-0.5 text-xs text-muted-foreground transition-transform group-open:rotate-180">
                              ▾
                            </span>
                          </summary>
                          <div className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                            <p className="whitespace-pre-wrap">{answer}</p>
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              {t("faq.source")}: {r.source_label}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-xs leading-relaxed text-muted-foreground">
          {t("faq.disclaimer")}
        </p>
      </div>

      {jsonLd ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
    </section>
  );
}
