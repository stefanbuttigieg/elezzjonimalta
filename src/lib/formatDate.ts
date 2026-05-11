import type { Locale } from "@/i18n/types";

/**
 * Format an ISO timestamp as a localized date (e.g. "10 May 2026").
 * Used in cards/listings to surface "Last updated" freshness.
 */
export function formatUpdatedAt(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "mt" ? "mt-MT" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
