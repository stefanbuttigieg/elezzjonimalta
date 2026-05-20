import { createFileRoute } from "@tanstack/react-router";
import { buildCatalogJsonLd, resolveOrigin } from "@/lib/dataCatalogue";

export const Route = createFileRoute("/api/public/v1/catalog[.]jsonld")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = resolveOrigin(request);
        const body = JSON.stringify(buildCatalogJsonLd(origin), null, 2);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/ld+json; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=3600",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            // DCAT-AP profile hint for harvesters (RFC 6906).
            Link: '<https://semiceu.github.io/DCAT-AP/releases/3.0.0/>; rel="profile"',
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
