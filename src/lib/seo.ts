/**
 * Centralised SEO helpers — canonical/og:url construction and absolute
 * hreflang URLs. Keep BASE_URL in sync with sitemap.xml.ts and robots.txt.
 */
export const SITE_URL = "https://elezzjoni.app";

export function absUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${SITE_URL}${path}`;
}

/**
 * Canonical + og:url meta/links for a localised leaf route.
 * Returns objects ready to spread into TanStack `head().meta` and `head().links`.
 */
export function canonicalFor(path: string) {
  const url = absUrl(path);
  return {
    meta: [
      { property: "og:url", content: url },
      { name: "twitter:url", content: url },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Absolute hreflang alternates for /en and /mt twin paths. */
export function hreflangAlternates(pathWithoutLang: string) {
  const clean = pathWithoutLang.startsWith("/") ? pathWithoutLang : `/${pathWithoutLang}`;
  const en = clean === "/" ? "/en" : `/en${clean}`;
  const mt = clean === "/" ? "/mt" : `/mt${clean}`;
  return [
    { rel: "alternate", hrefLang: "en", href: absUrl(en) },
    { rel: "alternate", hrefLang: "mt", href: absUrl(mt) },
    { rel: "alternate", hrefLang: "x-default", href: absUrl(en) },
  ];
}
