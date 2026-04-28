import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { LEGAL_CONTENT, LEGAL_LAST_UPDATED, type LegalSlug } from "./legal-content";

export function LegalPage({ slug, lang }: { slug: LegalSlug; lang: string }) {
  const t = useT();
  const loc: Locale = isLocale(lang) ? lang : "en";
  const { title, body } = LEGAL_CONTENT[slug][loc];

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("footer.legal")}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("legal.lastUpdated")}: {LEGAL_LAST_UPDATED}
        </p>
      </header>
      <div className="legal-prose mt-8 space-y-4 text-base leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground hover:[&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_code]:font-mono [&_code]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
        {body}
      </div>
    </article>
  );
}
