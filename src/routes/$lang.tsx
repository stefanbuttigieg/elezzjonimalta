import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CookieConsentBanner } from "@/components/site/CookieConsentBanner";
import { isLocale, LOCALE_HTML_LANG, type Locale } from "@/i18n/types";
import { translate } from "@/i18n/useT";
import { useEffect } from "react";

export const Route = createFileRoute("/$lang")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.lang)) {
      throw notFound();
    }
  },
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "Elezzjoni — Irriċerka l-kandidati għall-Elezzjoni Ġenerali"
        : "Elezzjoni — Research candidates for the General Election";
    const description = translate(lang, "site.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:locale", content: lang === "mt" ? "mt_MT" : "en_GB" },
      ],
      links: [
        { rel: "alternate", hrefLang: "en", href: "/en" },
        { rel: "alternate", hrefLang: "mt", href: "/mt" },
        { rel: "alternate", hrefLang: "x-default", href: "/en" },
      ],
    };
  },
  component: LangLayout,
});

function LangLayout() {
  const { lang } = Route.useParams();
  // Keep <html lang> in sync with the URL locale.
  useEffect(() => {
    if (typeof document !== "undefined" && isLocale(lang)) {
      document.documentElement.lang = LOCALE_HTML_LANG[lang];
    }
  }, [lang]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <CookieConsentBanner />
    </div>
  );
}
