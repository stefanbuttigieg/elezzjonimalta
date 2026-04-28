import { useParams } from "@tanstack/react-router";
import { dictionaries } from "./dictionaries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./types";

/**
 * Resolve the current locale from the /$lang URL segment.
 * Falls back to the default locale outside of localized routes.
 */
export function useLocale(): Locale {
  // strict: false → returns undefined when not under /$lang
  const params = useParams({ strict: false }) as { lang?: string };
  return isLocale(params.lang) ? params.lang : DEFAULT_LOCALE;
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] === undefined || vars[k] === null ? `{${k}}` : String(vars[k])
  );
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const value = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  return format(value, vars);
}

/**
 * Hook returning a translation function bound to the current locale.
 * Usage: const t = useT(); t("nav.home")
 */
export function useT() {
  const locale = useLocale();
  return (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
}
