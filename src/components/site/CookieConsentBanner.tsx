import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";

const STORAGE_KEY = "vm26-cookie-consent-v1";

export function CookieConsentBanner() {
  const t = useT();
  const params = useParams({ strict: false }) as { lang?: string };
  const lang: Locale = isLocale(params.lang) ? params.lang : "en";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) setVisible(true);
    } catch {
      // localStorage unavailable; show banner anyway
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const choose = (analytics: boolean) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ essential: true, analytics, decidedAt: new Date().toISOString() })
      );
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 shadow-elevated backdrop-blur"
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-body"
    >
      <div className="container mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p id="cookie-title" className="text-sm font-semibold text-foreground">
            {t("cookies.banner.title")}
          </p>
          <p id="cookie-body" className="mt-1 text-sm text-muted-foreground">
            {t("cookies.banner.body")}{" "}
            <Link
              to={`/${lang}/cookies`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t("cookies.banner.policy")}
            </Link>
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("cookies.banner.essentialOnly")}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("cookies.banner.acceptAll")}
          </button>
        </div>
      </div>
    </div>
  );
}
