import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  Paperclip,
  Share2,
  Upload,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchUrlMetadata, type UrlMetadata } from "@/lib/urlMetadata.functions";

// Module-level cache so we don't refetch the same URL across renders / list reloads
const metadataCache = new Map<string, UrlMetadata>();
const inflight = new Map<string, Promise<UrlMetadata>>();

function useUrlMetadata(url: string | null, enabled: boolean) {
  const fetcher = useServerFn(fetchUrlMetadata);
  const [meta, setMeta] = useState<UrlMetadata | null>(
    url ? metadataCache.get(url) ?? null : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !url) return;
    const cached = metadataCache.get(url);
    if (cached) {
      setMeta(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const existing = inflight.get(url);
    const p = existing ?? fetcher({ data: { url } });
    if (!existing) inflight.set(url, p);
    p.then((res) => {
      metadataCache.set(url, res);
      inflight.delete(url);
      if (!cancelled) setMeta(res);
    })
      .catch(() => {
        inflight.delete(url);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, enabled, fetcher]);

  return { meta, loading };
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function OgPreview({ url }: { url: string }) {
  const { meta, loading } = useUrlMetadata(url, true);

  if (loading && !meta) {
    return (
      <div className="mt-2 flex max-w-md items-center gap-2 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Fetching preview…
      </div>
    );
  }
  if (!meta || (!meta.title && !meta.description && !meta.image)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-md overflow-hidden rounded-md border border-border bg-background hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex">
        {meta.image ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden bg-muted sm:h-28 sm:w-28">
            <img
              src={meta.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {meta.favicon ? (
              <img
                src={meta.favicon}
                alt=""
                className="h-3 w-3"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <span className="truncate">{meta.siteName ?? hostOf(meta.finalUrl)}</span>
          </div>
          {meta.title ? (
            <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">
              {meta.title}
            </div>
          ) : null}
          {meta.description ? (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {meta.description}
            </div>
          ) : null}
        </div>
      </div>
    </a>
  );
}


type SourceKind = "link" | "attachment" | "social";

interface ProposalSource {
  id: string;
  proposal_id: string;
  url: string;
  label: string | null;
  note: string | null;
  kind: SourceKind;
  storage_path: string | null;
  media_type: string | null;
  file_size: number | null;
  created_at: string;
}

const SOCIAL_PATTERNS: Array<{ host: RegExp; label: string }> = [
  { host: /facebook\.com|fb\.com/i, label: "Facebook" },
  { host: /instagram\.com/i, label: "Instagram" },
  { host: /twitter\.com|x\.com/i, label: "X / Twitter" },
  { host: /tiktok\.com/i, label: "TikTok" },
  { host: /linkedin\.com/i, label: "LinkedIn" },
  { host: /youtube\.com|youtu\.be/i, label: "YouTube" },
  { host: /threads\.net/i, label: "Threads" },
];

function detectSocial(url: string): string | null {
  for (const { host, label } of SOCIAL_PATTERNS) if (host.test(url)) return label;
  return null;
}

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProposalSourcesSection({ proposalId }: { proposalId: string }) {
  const [sources, setSources] = useState<ProposalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<SourceKind>("link");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposal_sources" as never)
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setSources((data ?? []) as unknown as ProposalSource[]);
    setLoading(false);
  };

  useEffect(() => {
    if (proposalId) void load();
  }, [proposalId]);

  const addLink = async () => {
    if (!url.trim()) {
      toast.error("URL is required");
      return;
    }
    setAdding(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const trimmedUrl = url.trim();
      const detected = detectSocial(trimmedUrl);
      const finalKind: SourceKind = kind === "link" && detected ? "social" : kind;
      const finalLabel = label.trim() || detected || null;
      const { error } = await supabase.from("proposal_sources" as never).insert({
        proposal_id: proposalId,
        url: trimmedUrl,
        label: finalLabel,
        note: note.trim() || null,
        kind: finalKind,
        added_by: userRes.user?.id ?? null,
      } as never);
      if (error) throw error;
      setUrl("");
      setLabel("");
      setNote("");
      toast.success(finalKind === "social" ? "Social post added" : "Link added");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File is larger than 20 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
      const path = `${proposalId}/${Date.now()}-${safeName || `file.${ext}`}`;
      const up = await supabase.storage
        .from("proposal-attachments")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("proposal-attachments").getPublicUrl(path);
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("proposal_sources" as never).insert({
        proposal_id: proposalId,
        url: pub.publicUrl,
        label: label.trim() || file.name,
        note: note.trim() || null,
        kind: "attachment",
        storage_path: path,
        media_type: file.type || null,
        file_size: file.size,
        added_by: userRes.user?.id ?? null,
      } as never);
      if (error) throw error;
      setLabel("");
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Attachment uploaded");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (s: ProposalSource) => {
    if (!confirm(s.kind === "attachment" ? "Delete this attachment?" : "Remove this entry?"))
      return;
    try {
      if (s.kind === "attachment" && s.storage_path) {
        await supabase.storage.from("proposal-attachments").remove([s.storage_path]);
      }
      const { error } = await supabase
        .from("proposal_sources" as never)
        .delete()
        .eq("id", s.id);
      if (error) throw error;
      toast.success("Removed");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const iconFor = (k: SourceKind) =>
    k === "attachment" ? (
      <Paperclip className="h-3 w-3" />
    ) : k === "social" ? (
      <Share2 className="h-3 w-3" />
    ) : (
      <Link2 className="h-3 w-3" />
    );

  const isImage = (s: ProposalSource) =>
    (s.media_type?.startsWith("image/") ?? false) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(s.url);

  const socialEmbed = (url: string): { type: "iframe" | "image"; src: string; aspect?: string } | null => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      // YouTube
      if (host === "youtube.com" || host === "m.youtube.com") {
        const v = u.searchParams.get("v");
        if (v) return { type: "iframe", src: `https://www.youtube.com/embed/${v}`, aspect: "16/9" };
        const m = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/);
        if (m) return { type: "iframe", src: `https://www.youtube.com/embed/${m[1]}`, aspect: "16/9" };
      }
      if (host === "youtu.be") {
        const id = u.pathname.slice(1);
        if (id) return { type: "iframe", src: `https://www.youtube.com/embed/${id}`, aspect: "16/9" };
      }
      // TikTok
      if (host.endsWith("tiktok.com")) {
        const m = u.pathname.match(/\/video\/(\d+)/);
        if (m) return { type: "iframe", src: `https://www.tiktok.com/embed/v2/${m[1]}`, aspect: "9/16" };
      }
      // X/Twitter via publish.twitter embed
      if (host === "twitter.com" || host === "x.com") {
        return {
          type: "iframe",
          src: `https://platform.twitter.com/embed/Tweet.html?url=${encodeURIComponent(url)}&theme=light`,
          aspect: "4/5",
        };
      }
      // Instagram embed
      if (host.endsWith("instagram.com")) {
        return { type: "iframe", src: `${url.replace(/\/?$/, "/")}embed`, aspect: "4/5" };
      }
      // Facebook plugin
      if (host.endsWith("facebook.com") || host === "fb.watch") {
        return {
          type: "iframe",
          src: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=500`,
          aspect: "4/5",
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4" /> Sources, attachments &amp; social ({sources.length})
      </h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"
                    title={s.kind}
                  >
                    {iconFor(s.kind)} {s.kind}
                  </span>
                  {s.label ? <span className="font-medium">{s.label}</span> : null}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 truncate text-primary hover:underline"
                  >
                    <span className="truncate">
                      {s.kind === "attachment" && s.storage_path
                        ? s.storage_path.split("/").pop()
                        : s.url}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                {s.kind === "attachment" && isImage(s) ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block max-w-xs overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img
                      src={s.url}
                      alt={s.label ?? "Attachment preview"}
                      loading="lazy"
                      className="block max-h-48 w-full object-contain"
                    />
                  </a>
                ) : null}
                {(s.kind === "link" || s.kind === "social") ? (
                  <OgPreview url={s.url} />
                ) : null}
                {s.kind === "social" && socialEmbed(s.url) ? (
                  <div
                    className="mt-2 max-w-md overflow-hidden rounded-md border border-border bg-muted"
                    style={{ aspectRatio: socialEmbed(s.url)!.aspect ?? "16/9" }}
                  >
                    <iframe
                      src={socialEmbed(s.url)!.src}
                      title={s.label ?? "Social post preview"}
                      loading="lazy"
                      allow="autoplay; encrypted-media; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : null}
                {s.note ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.note}</div>
                ) : null}
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.kind === "attachment" && s.file_size
                    ? `${formatBytes(s.file_size)} · `
                    : ""}
                  Added {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => remove(s)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
          {(
            [
              { v: "link", icon: Link2, label: "Link" },
              { v: "social", icon: Share2, label: "Social post" },
              { v: "attachment", icon: Paperclip, label: "Attachment" },
            ] as Array<{ v: SourceKind; icon: typeof Link2; label: string }>
          ).map(({ v, icon: Icon, label: l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setKind(v)}
              className={
                "inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 font-medium " +
                (kind === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              <Icon className="h-3 w-3" /> {l}
            </button>
          ))}
        </div>

        {kind === "attachment" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional, defaults to filename)"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
                disabled={uploading}
                className="block text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
              />
              {uploading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Upload className="h-3 w-3 animate-pulse" /> Uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" /> Max 20 MB · photos, PDFs, docs, etc.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                kind === "social"
                  ? "https://facebook.com/… or x.com/…"
                  : "https://example.com/article"
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                kind === "social" ? "Label (auto-detected)" : "Label (e.g. Manifesto)"
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={addLink}
              disabled={adding}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> {adding ? "Adding…" : "Add"}
            </button>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary sm:col-span-3"
            />
          </div>
        )}
      </div>
    </section>
  );
}
