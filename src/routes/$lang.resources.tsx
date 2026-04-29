import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Globe, Landmark, BarChart3, Newspaper } from "lucide-react";
import type { ComponentType } from "react";
import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { translate } from "@/i18n/useT";

type Resource = {
  id: string;
  url: string;
  host: string;
  Icon: ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
  tagKey: string;
};

const RESOURCES: Resource[] = [
  {
    id: "vot-mt",
    url: "https://vot.mt/",
    host: "vot.mt",
    Icon: Globe,
    titleKey: "resources.votmt.title",
    descKey: "resources.votmt.desc",
    tagKey: "resources.tag.civic",
  },
  {
    id: "electoral-gov-mt",
    url: "https://electoral.gov.mt",
    host: "electoral.gov.mt",
    Icon: Landmark,
    titleKey: "resources.electoral.title",
    descKey: "resources.electoral.desc",
    tagKey: "resources.tag.official",
  },
  {
    id: "maltaelections-io",
    url: "https://maltaelections.io/",
    host: "maltaelections.io",
    Icon: BarChart3,
    titleKey: "resources.maltaelections.title",
    descKey: "resources.maltaelections.desc",
    tagKey: "resources.tag.data",
  },
  {
    id: "filqosor",
    url: "https://filqosor.com/",
    host: "filqosor.com",
    Icon: Newspaper,
    titleKey: "resources.filqosor.title",
    descKey: "resources.filqosor.desc",
    tagKey: "resources.tag.news",
  },
];

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

        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {RESOURCES.map((r) => {
            const Icon = r.Icon;
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
                    <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(r.tagKey)}
                    </span>
                  </div>
                  <h2 className="mt-4 font-serif text-xl font-bold text-foreground">
                    {t(r.titleKey)}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{r.host}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {t(r.descKey)}
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

        <p className="mt-10 rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-xs leading-relaxed text-muted-foreground">
          {t("resources.disclaimer")}
        </p>
      </div>
    </section>
  );
}
