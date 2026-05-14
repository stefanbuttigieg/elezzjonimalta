import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://elezzjoni.app";
const LOCALES = ["en", "mt"] as const;

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Public, indexable pages exposed under /:lang/...
// Keep in sync with src/routes/$lang.*.tsx (admin, auth, api excluded).
const STATIC_PATHS: Array<{ path: string; changefreq?: SitemapEntry["changefreq"]; priority?: string }> = [
  { path: "", changefreq: "daily", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/candidates", changefreq: "daily", priority: "0.9" },
  { path: "/parties", changefreq: "weekly", priority: "0.9" },
  { path: "/parties-compare", changefreq: "weekly", priority: "0.7" },
  { path: "/proposals", changefreq: "daily", priority: "0.9" },
  { path: "/community-proposals", changefreq: "daily", priority: "0.7" },
  { path: "/themes", changefreq: "weekly", priority: "0.7" },
  { path: "/districts", changefreq: "weekly", priority: "0.7" },
  { path: "/sitting-mps", changefreq: "weekly", priority: "0.7" },
  { path: "/compare", changefreq: "weekly", priority: "0.6" },
  { path: "/search", changefreq: "weekly", priority: "0.5" },
  { path: "/ask", changefreq: "weekly", priority: "0.5" },
  { path: "/faq", changefreq: "monthly", priority: "0.5" },
  { path: "/resources", changefreq: "weekly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
  { path: "/changelog", changefreq: "weekly", priority: "0.4" },
  { path: "/developers", changefreq: "monthly", priority: "0.3" },
  { path: "/accessibility", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [];

        // Static localised pages
        for (const lang of LOCALES) {
          for (const p of STATIC_PATHS) {
            entries.push({
              path: `/${lang}${p.path}`,
              changefreq: p.changefreq,
              priority: p.priority,
            });
          }
        }

        // Dynamic: candidates
        try {
          const { data: candidates } = await supabaseAdmin
            .from("candidates")
            .select("slug, updated_at")
            .eq("status", "published")
            .not("slug", "is", null);
          for (const c of candidates ?? []) {
            for (const lang of LOCALES) {
              entries.push({
                path: `/${lang}/candidates/${c.slug}`,
                lastmod: c.updated_at?.slice(0, 10),
                changefreq: "weekly",
                priority: "0.7",
              });
            }
          }
        } catch {
          // If query fails, still emit static entries.
        }

        // Dynamic: parties
        try {
          const { data: parties } = await supabaseAdmin
            .from("parties")
            .select("slug, updated_at")
            .not("slug", "is", null);
          for (const p of parties ?? []) {
            for (const lang of LOCALES) {
              entries.push({
                path: `/${lang}/parties/${p.slug}`,
                lastmod: p.updated_at?.slice(0, 10),
                changefreq: "weekly",
                priority: "0.7",
              });
            }
          }
        } catch {
          // ignore
        }

        // Dynamic: districts (1..13)
        for (let n = 1; n <= 13; n++) {
          for (const lang of LOCALES) {
            entries.push({
              path: `/${lang}/my-district/${n}`,
              changefreq: "weekly",
              priority: "0.6",
            });
          }
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
