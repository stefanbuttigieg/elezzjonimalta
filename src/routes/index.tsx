import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Root URL: detect browser language and redirect to /en or /mt.
 * Defaults to English for non-mt locales.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    let target: "en" | "mt" = "en";
    if (typeof navigator !== "undefined") {
      const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
      if (langs.some((l) => l?.toLowerCase().startsWith("mt"))) target = "mt";
    }
    throw redirect({ to: "/$lang", params: { lang: target }, replace: true });
  },
  component: () => null,
});
