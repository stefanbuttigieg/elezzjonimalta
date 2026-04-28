export type Locale = "en" | "mt";

export const LOCALES: readonly Locale[] = ["en", "mt"] as const;
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "mt";
}

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  mt: "Malti",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en",
  mt: "mt",
};
