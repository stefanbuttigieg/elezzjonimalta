import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { LEGAL_CONTENT } from "@/components/site/legal-content";
import { isLocale, type Locale } from "@/i18n/types";

export const Route = createFileRoute("/$lang/cookies")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    return { meta: [{ title: `${LEGAL_CONTENT.cookies[lang].title} — Elezzjoni 2026` }] };
  },
  component: () => {
    const { lang } = Route.useParams();
    return <LegalPage slug="cookies" lang={lang} />;
  },
});
