import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { translate } from "@/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { RESOURCE_ICONS, type ResourceIcon } from "@/lib/resourceIcons";

type Resource = {
  id: string;
  url: string;
  host: string;
  icon: ResourceIcon;
  tag_en: string;
  tag_mt: string;
  title_en: string;
  title_mt: string;
  description_en: string;
  description_mt: string;
};

export const Route = createFileRoute("/$lang/resources")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "resources.meta.title");
    const description = translate(lang, "resources.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ResourcesPage,
});

function ResourcesPage() {
  const t = useT();
  const params = Route.useParams();
  const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("site_resources")
        .select(
          "id,url,host,icon,tag_en,tag_mt,title_en,title_mt,description_en,description_mt",
        )
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (!cancelled) {
        setResources((data ?? []) as Resource[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("site.tagline")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
            {t("resources.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("resources.subtitle")}
          </p>
        </header>

        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">…</p>
        ) : (
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {resources.map((r) => {
              const Icon = RESOURCE_ICONS[r.icon] ?? RESOURCE_ICONS.globe;
              const title = lang === "mt" && r.title_mt ? r.title_mt : r.title_en;
              const desc =
                lang === "mt" && r.description_mt ? r.description_mt : r.description_en;
              const tag = lang === "mt" && r.tag_mt ? r.tag_mt : r.tag_en;
              return (
                <li key={r.id}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-5 w-5" />
                      </div>
                      {tag ? (
                        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {tag}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-4 font-serif text-xl font-bold text-foreground">
                      {title}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {r.host}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:text-primary">
                      {t("resources.visit")}
                      <ExternalLink className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-xs leading-relaxed text-muted-foreground">
          {t("resources.disclaimer")}
        </p>
      </div>
    </section>
  );
}
