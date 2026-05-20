import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Download, ExternalLink, FileJson, Globe } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";
import {
  CATALOGUE_LICENCE,
  CATALOGUE_PUBLISHER,
  CATALOGUE_SPATIAL,
  DATASETS,
  type Dataset,
  type LangString,
} from "@/lib/dataCatalogue";

export const Route = createFileRoute("/$lang/data")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title = translate(lang, "data.meta.title");
    const description = translate(lang, "data.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: DataPage,
});

function pick(s: LangString | undefined, locale: Locale): string {
  if (!s) return "";
  return locale === "mt" && s.mt ? s.mt : s.en;
}

function DataPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("site.tagline")}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-bold text-foreground md:text-5xl">
          {t("data.title")}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {t("data.intro")}
        </p>

        {/* Catalogue meta */}
        <dl className="mt-8 grid gap-4 rounded-2xl border border-border bg-surface p-5 text-sm shadow-card md:grid-cols-2">
          <MetaRow label={t("data.meta.profile")} value="DCAT-AP 3.0" />
          <MetaRow label={t("data.meta.publisher")} value={CATALOGUE_PUBLISHER.name} />
          <MetaRow
            label={t("data.meta.licence")}
            value={
              <a
                href={CATALOGUE_LICENCE.href}
                target="_blank"
                rel="noreferrer"
                className="text-foreground hover:underline"
              >
                {CATALOGUE_LICENCE.label}
              </a>
            }
          />
          <MetaRow label={t("data.meta.spatial")} value={CATALOGUE_SPATIAL.label} />
          <MetaRow
            label={t("data.meta.languages")}
            value="English, Malti"
          />
          <MetaRow
            label={t("data.meta.feed")}
            value={
              <a
                href="/api/public/v1/catalog.jsonld"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
              >
                /api/public/v1/catalog.jsonld
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/public/v1/catalog.jsonld"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            <Download className="h-4 w-4" />
            {t("data.download.jsonld")}
          </a>
          <Link
            to="/$lang/developers"
            params={{ lang: locale }}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
          >
            <Globe className="h-4 w-4" />
            {t("data.developers")}
          </Link>
        </div>

        <h2 className="mt-12 font-serif text-2xl font-bold text-foreground">
          {t("data.datasets")} ({DATASETS.length})
        </h2>

        <ul className="mt-4 grid gap-4">
          {DATASETS.map((d) => (
            <DatasetCard key={d.id} dataset={d} locale={locale} t={t} />
          ))}
        </ul>

        <p className="mt-10 text-xs text-muted-foreground">{t("data.footnote")}</p>
      </div>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

function DatasetCard({
  dataset,
  locale,
  t,
}: {
  dataset: Dataset;
  locale: Locale;
  t: (k: string) => string;
}) {
  const kws = dataset.keywords[locale] ?? dataset.keywords.en;
  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Database className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg font-bold text-foreground">
            {pick(dataset.title, locale)}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pick(dataset.description, locale)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <MetaRow label={t("data.field.id")} value={<code className="font-mono">{dataset.id}</code>} />
        <MetaRow label={t("data.field.modified")} value={dataset.modified} />
        <MetaRow label={t("data.field.issued")} value={dataset.issued} />
        <MetaRow
          label={t("data.field.frequency")}
          value={<code className="font-mono text-[10px]">{dataset.accrualPeriodicity.split("/").pop()}</code>}
        />
      </dl>

      {kws.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {kws.map((k) => (
            <li
              key={k}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {k}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("data.field.distributions")}
        </h4>
        <ul className="mt-2 space-y-2">
          {dataset.distributions.map((dist) => (
            <li
              key={dist.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {pick(dist.title, locale)}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {dist.mediaType}
                </span>
              </div>
              <a
                href={dist.accessPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {t("data.open")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>

      {dataset.landingPath && (
        <a
          href={dataset.landingPath}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {t("data.landing")}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}
