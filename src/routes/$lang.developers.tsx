import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, ExternalLink, ShieldAlert } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/types";
import { translate, useT } from "@/i18n/useT";

export const Route = createFileRoute("/$lang/developers")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "API għall-iżviluppaturi — Elezzjoni 2026"
        : "Developer API — Elezzjoni 2026";
    const description =
      lang === "mt"
        ? "Endpoints pubbliċi JSON read-only għad-data tal-Elezzjoni Ġenerali Maltija 2026: partiti, distretti u kandidati."
        : "Public read-only JSON endpoints for Malta's 2026 General Election data: parties, districts, and candidates.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: DevelopersPage,
});

type Endpoint = {
  method: "GET";
  path: string;
  summary: string;
  query?: { name: string; type: string; desc: string }[];
  example: string;
};

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/public/v1/parties",
    summary: "List all published parties.",
    example: `curl https://elezzjonimalta.lovable.app/api/public/v1/parties`,
  },
  {
    method: "GET",
    path: "/api/public/v1/districts",
    summary: "List all 13 published electoral districts with their localities.",
    example: `curl https://elezzjonimalta.lovable.app/api/public/v1/districts`,
  },
  {
    method: "GET",
    path: "/api/public/v1/candidates",
    summary:
      "List published candidates. Filter by district number/UUID or party slug/UUID.",
    query: [
      {
        name: "district",
        type: "string",
        desc: "District number 1–13 or district UUID. Filters by primary_district_id.",
      },
      { name: "party", type: "string", desc: "Party slug (e.g. pn, pl, adpd) or party UUID." },
      { name: "limit", type: "integer", desc: "1–500 (default 100)." },
    ],
    example: `curl "https://elezzjonimalta.lovable.app/api/public/v1/candidates?district=6&party=pl"`,
  },
];

function DevelopersPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale: Locale = isLocale(lang) ? lang : "en";

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Code2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {translate(locale, "developers.eyebrow")}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-foreground md:text-5xl">
              {translate(locale, "developers.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {translate(locale, "developers.intro")}
            </p>
          </div>
        </div>

        {/* Quick facts */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Fact label={translate(locale, "developers.facts.format")} value="JSON" />
          <Fact label={translate(locale, "developers.facts.auth")} value={translate(locale, "developers.facts.authValue")} />
          <Fact label={translate(locale, "developers.facts.cors")} value="*" />
        </div>

        {/* Rate limit notice */}
        <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
            <ShieldAlert className="h-4 w-4 text-primary" />
            {translate(locale, "developers.rate.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {translate(locale, "developers.rate.body")}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-foreground">
            <li>
              <strong>60</strong> {translate(locale, "developers.rate.perMinute")}
            </li>
            <li>{translate(locale, "developers.rate.headers")}</li>
            <li>{translate(locale, "developers.rate.exceeded")}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {translate(locale, "developers.rate.disclaimer")}
          </p>
        </div>

        {/* Endpoints */}
        <h2 className="mt-12 font-serif text-2xl font-bold text-foreground">
          {translate(locale, "developers.endpoints.title")}
        </h2>
        <div className="mt-4 space-y-6">
          {endpoints.map((ep) => (
            <article
              key={ep.path}
              className="rounded-xl border border-border bg-surface p-5 shadow-card"
            >
              <header className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                  {ep.method}
                </span>
                <code className="font-mono text-sm font-semibold text-foreground">
                  {ep.path}
                </code>
              </header>
              <p className="mt-2 text-sm text-muted-foreground">{ep.summary}</p>

              {ep.query && ep.query.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {translate(locale, "developers.endpoints.queryParams")}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {ep.query.map((q) => (
                      <li key={q.name} className="flex flex-wrap items-baseline gap-2">
                        <code className="font-mono text-xs font-bold text-foreground">
                          {q.name}
                        </code>
                        <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent-foreground">
                          {q.type}
                        </span>
                        <span className="text-muted-foreground">{q.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {translate(locale, "developers.endpoints.example")}
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/95 p-3 font-mono text-xs leading-relaxed text-background">
                  {ep.example}
                </pre>
              </div>
            </article>
          ))}
        </div>

        {/* Response shape */}
        <h2 className="mt-12 font-serif text-2xl font-bold text-foreground">
          {translate(locale, "developers.response.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {translate(locale, "developers.response.body")}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-foreground/95 p-4 font-mono text-xs leading-relaxed text-background">
{`{
  "data": [ /* records */ ],
  "meta": {
    "count": 13,
    "generatedAt": "2026-04-29T08:00:00.000Z"
  }
}`}
        </pre>

        {/* Attribution */}
        <h2 className="mt-12 font-serif text-2xl font-bold text-foreground">
          {translate(locale, "developers.attribution.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {translate(locale, "developers.attribution.body")}
        </p>
        <p className="mt-4 text-sm">
          <Link
            to="/$lang/about"
            params={{ lang: locale }}
            className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
          >
            {t("nav.about")}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-serif text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
