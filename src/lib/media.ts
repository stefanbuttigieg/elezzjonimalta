// Detects video/podcast provider from a URL and returns an embed id.
// Used by both admin (on URL change) and public profile (to render embeds).

export type MediaProvider =
  | "youtube"
  | "spotify"
  | "apple"
  | "soundcloud"
  | "vimeo"
  | "rss"
  | "other";

export interface DetectedMedia {
  provider: MediaProvider;
  embedId: string | null;
  embedUrl: string | null;
}

export function detectMedia(rawUrl: string): DetectedMedia {
  const fallback: DetectedMedia = { provider: "other", embedId: null, embedUrl: null };
  if (!rawUrl) return fallback;

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return fallback;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0] || null;
    return { provider: "youtube", embedId: id, embedUrl: id ? `https://www.youtube.com/embed/${id}` : null };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return { provider: "youtube", embedId: v, embedUrl: `https://www.youtube.com/embed/${v}` };
    const m = u.pathname.match(/^\/(embed|shorts)\/([^/?]+)/);
    if (m) return { provider: "youtube", embedId: m[2], embedUrl: `https://www.youtube.com/embed/${m[2]}` };
  }

  // Spotify
  if (host === "open.spotify.com") {
    const m = u.pathname.match(/^\/(episode|show|track|playlist)\/([^/?]+)/);
    if (m) {
      return {
        provider: "spotify",
        embedId: `${m[1]}/${m[2]}`,
        embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
      };
    }
  }

  // Apple Podcasts (no public embed, link only — but mark provider)
  if (host.endsWith("podcasts.apple.com")) {
    return { provider: "apple", embedId: null, embedUrl: null };
  }

  // SoundCloud (link only by default)
  if (host.endsWith("soundcloud.com")) {
    return { provider: "soundcloud", embedId: null, embedUrl: null };
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (id && /^\d+$/.test(id)) {
      return { provider: "vimeo", embedId: id, embedUrl: `https://player.vimeo.com/video/${id}` };
    }
  }

  // RSS-style feed
  if (rawUrl.endsWith(".xml") || rawUrl.endsWith(".rss") || u.pathname.includes("/feed")) {
    return { provider: "rss", embedId: null, embedUrl: null };
  }

  return fallback;
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
