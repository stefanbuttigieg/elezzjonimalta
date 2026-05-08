import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface UrlMetadata {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  error?: string;
}

const InputSchema = z.object({
  url: z.string().url().max(2048),
});

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    // property="og:title" or name="twitter:title", content can come before or after
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1].trim());
    }
  }
  return null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

function pickFavicon(html: string, base: string): string | null {
  const m = html.match(
    /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i
  );
  if (m?.[1]) return absolutize(m[1], base);
  try {
    return new URL("/favicon.ico", base).toString();
  } catch {
    return null;
  }
}

function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export const fetchUrlMetadata = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<UrlMetadata> => {
    const empty: UrlMetadata = {
      url: data.url,
      finalUrl: data.url,
      title: null,
      description: null,
      image: null,
      siteName: null,
      favicon: null,
    };
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(data.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          // Many sites gate OG tags behind a real-looking UA
          "User-Agent":
            "Mozilla/5.0 (compatible; ElezzjoniBot/1.0; +https://elezzjoni.app) facebookexternalhit/1.1",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en,mt;q=0.9",
        },
      }).catch((e) => {
        throw e;
      });
      clearTimeout(t);
      if (!res.ok) return { ...empty, error: `HTTP ${res.status}` };
      const ct = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(ct)) {
        return { ...empty, finalUrl: res.url, error: `Unsupported content-type: ${ct}` };
      }
      // Read at most ~512 KB to keep things light
      const reader = res.body?.getReader();
      let html = "";
      const decoder = new TextDecoder();
      let total = 0;
      const MAX = 512 * 1024;
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (total >= MAX || /<\/head>/i.test(html)) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            break;
          }
        }
        html += decoder.decode();
      } else {
        html = await res.text();
      }

      const finalUrl = res.url || data.url;
      const title =
        pickMeta(html, ["og:title", "twitter:title"]) ?? pickTitle(html);
      const description = pickMeta(html, [
        "og:description",
        "twitter:description",
        "description",
      ]);
      const rawImage = pickMeta(html, [
        "og:image:secure_url",
        "og:image",
        "twitter:image",
        "twitter:image:src",
      ]);
      const siteName = pickMeta(html, ["og:site_name", "application-name"]);
      const favicon = pickFavicon(html, finalUrl);

      return {
        url: data.url,
        finalUrl,
        title,
        description,
        image: rawImage ? absolutize(rawImage, finalUrl) : null,
        siteName,
        favicon,
      };
    } catch (e) {
      return {
        ...empty,
        error: e instanceof Error ? e.message : "Failed to fetch metadata",
      };
    }
  });
