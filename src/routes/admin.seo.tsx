import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Search, Trash2, ExternalLink, Sparkles } from "lucide-react";
import type { PageSeoRow } from "@/lib/seoOverrides";

export const Route = createFileRoute("/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO — Elezzjoni Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSeoPage,
});

// Mirrors STATIC_PATHS in src/routes/sitemap[.]xml.ts (without the lang prefix).
const PUBLIC_PATHS: { path: string; group: string; label: string }[] = [
  { path: "/", group: "Main", label: "Home" },
  { path: "/candidates", group: "Main", label: "Candidates" },
  { path: "/parties", group: "Main", label: "Parties" },
  { path: "/parties-compare", group: "Main", label: "Parties — Compare" },
  { path: "/proposals", group: "Main", label: "Proposals" },
  { path: "/community-proposals", group: "Main", label: "Community proposals" },
  { path: "/themes", group: "Main", label: "Themes" },
  { path: "/districts", group: "Main", label: "Districts" },
  { path: "/sitting-mps", group: "Main", label: "Sitting MPs" },
  { path: "/compare", group: "Main", label: "Compare candidates" },
  { path: "/search", group: "Main", label: "Search" },
  { path: "/ask", group: "Main", label: "Ask AI" },
  { path: "/faq", group: "Main", label: "Voting FAQ" },
  { path: "/resources", group: "Main", label: "Resources" },
  { path: "/about", group: "Info", label: "About" },
  { path: "/contact", group: "Info", label: "Contact" },
  { path: "/changelog", group: "Info", label: "Changelog" },
  { path: "/developers", group: "Info", label: "Developers / API" },
  { path: "/accessibility", group: "Info", label: "Accessibility" },
  { path: "/privacy", group: "Info", label: "Privacy" },
  { path: "/terms", group: "Info", label: "Terms" },
  { path: "/cookies", group: "Info", label: "Cookies" },
];

const LANGS = ["en", "mt"] as const;
type Lang = (typeof LANGS)[number];

type EditingRow = Partial<PageSeoRow> & { path: string; lang: Lang };

function useAllSeo() {
  return useQuery({
    queryKey: ["page_seo", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_seo")
        .select("*")
        .order("path");
      if (error) throw error;
      return (data ?? []) as PageSeoRow[];
    },
  });
}

function AdminSeoPage() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useAllSeo();
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [filter, setFilter] = useState("");
  const [showOnly, setShowOnly] = useState<"all" | "missing" | "overridden" | "noindex">("all");

  const byKey = useMemo(() => {
    const map = new Map<string, PageSeoRow>();
    for (const r of rows ?? []) map.set(`${r.path}::${r.lang}`, r);
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return PUBLIC_PATHS.filter((p) => {
      if (term) {
        const blob = `${p.path} ${p.label} ${p.group}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      if (showOnly === "all") return true;
      const en = byKey.get(`${p.path}::en`);
      const mt = byKey.get(`${p.path}::mt`);
      if (showOnly === "overridden") return Boolean(en || mt);
      if (showOnly === "missing")
        return !(en?.title || en?.description) || !(mt?.title || mt?.description);
      if (showOnly === "noindex") return Boolean(en?.noindex || mt?.noindex);
      return true;
    });
  }, [filter, showOnly, byKey]);

  const upsert = useMutation({
    mutationFn: async (input: EditingRow) => {
      const payload = {
        path: input.path,
        lang: input.lang,
        title: emptyToNull(input.title),
        description: emptyToNull(input.description),
        og_image: emptyToNull(input.og_image),
        keywords: input.keywords ?? [],
        noindex: Boolean(input.noindex),
        notes: emptyToNull(input.notes),
      };
      const { error } = await supabase
        .from("page_seo")
        .upsert(payload, { onConflict: "path,lang" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SEO override saved");
      qc.invalidateQueries({ queryKey: ["page_seo"] });
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("page_seo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removed");
      qc.invalidateQueries({ queryKey: ["page_seo"] });
    },
  });

  const stats = useMemo(() => {
    const total = PUBLIC_PATHS.length * 2;
    const overridden = rows?.length ?? 0;
    const noindex = (rows ?? []).filter((r) => r.noindex).length;
    const withKeywords = (rows ?? []).filter((r) => r.keywords?.length).length;
    return { total, overridden, noindex, withKeywords };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">SEO Overrides</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Override page titles, descriptions, social images, target keywords and indexing rules
            per page and language. Overrides take effect immediately on the live site.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages" value={`${PUBLIC_PATHS.length} × 2 langs`} />
        <Stat label="Overrides set" value={`${stats.overridden} / ${stats.total}`} />
        <Stat label="With target keywords" value={String(stats.withKeywords)} />
        <Stat label="Noindexed" value={String(stats.noindex)} />
      </div>

      {/* Semrush hint */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-foreground">SEO snapshot (via Semrush)</p>
            <p className="mt-1">
              <code>elezzjoni.app</code> currently has Authority/Trust 0/100 with only spam
              backlinks — winning Maltese election keywords (e.g. <em>elezzjoni 2026</em>,{" "}
              <em>kandidati elezzjoni</em>) is realistic with strong on-page SEO. Use the{" "}
              <strong>target keywords</strong> field below to record what each page should rank
              for; this guides future copy edits.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search pages…"
            className="w-64 pl-8"
          />
        </div>
        <Select value={showOnly} onValueChange={(v) => setShowOnly(v as typeof showOnly)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pages</SelectItem>
            <SelectItem value="missing">Missing override</SelectItem>
            <SelectItem value="overridden">Has override</SelectItem>
            <SelectItem value="noindex">Noindexed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <Card key={p.path}>
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.path}</code>
                    <span className="text-sm font-medium">{p.label}</span>
                    <Badge variant="outline" className="text-[10px]">{p.group}</Badge>
                  </div>
                  <div className="flex gap-1">
                    {LANGS.map((lang) => (
                      <a
                        key={lang}
                        href={`/${lang}${p.path === "/" ? "" : p.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        {lang.toUpperCase()} <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {LANGS.map((lang) => {
                    const row = byKey.get(`${p.path}::${lang}`);
                    return (
                      <div
                        key={lang}
                        className="flex items-start justify-between gap-3 rounded border border-border bg-background p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">{lang.toUpperCase()}</Badge>
                            {row?.noindex && (
                              <Badge variant="destructive" className="text-[10px]">noindex</Badge>
                            )}
                            {!row && (
                              <span className="text-[11px] text-muted-foreground">No override</span>
                            )}
                          </div>
                          {row?.title && (
                            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                          )}
                          {row?.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {row.description}
                            </p>
                          )}
                          {row?.keywords && row.keywords.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {row.keywords.slice(0, 4).map((k) => (
                                <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                              ))}
                              {row.keywords.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{row.keywords.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setEditing({
                                ...(row ?? {}),
                                path: p.path,
                                lang,
                                keywords: row?.keywords ?? [],
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {row && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm("Remove this override?")) remove.mutate(row.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No pages match.</p>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              SEO override — <code className="text-sm">{editing?.path}</code> ({editing?.lang?.toUpperCase()})
            </DialogTitle>
            <DialogDescription>
              Leave any field blank to keep the route's built-in default for that field.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="60 chars or fewer, include primary keyword"
                  maxLength={120}
                />
                <CharCount value={editing.title ?? ""} ideal={60} />
              </div>
              <div>
                <Label>Meta description</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="155–160 chars, summarise the page and what the visitor can do"
                  rows={3}
                  maxLength={300}
                />
                <CharCount value={editing.description ?? ""} ideal={160} />
              </div>
              <div>
                <Label>Social image URL (og:image)</Label>
                <Input
                  value={editing.og_image ?? ""}
                  onChange={(e) => setEditing({ ...editing, og_image: e.target.value })}
                  placeholder="https://elezzjoni.app/og-…png  (1200×630)"
                />
              </div>
              <div>
                <Label>Target keywords (informational)</Label>
                <KeywordInput
                  value={editing.keywords ?? []}
                  onChange={(kw) => setEditing({ ...editing, keywords: kw })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Press Enter or comma to add. Used as a planning aid (and as a meta keywords tag).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.noindex ?? false}
                  onCheckedChange={(v) => setEditing({ ...editing, noindex: v })}
                />
                <Label>Noindex (hide from search engines)</Label>
              </div>
              <div>
                <Label>Internal notes</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                  placeholder="Why this override exists, sources, follow-ups…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() => editing && upsert.mutate(editing)}
              disabled={upsert.isPending}
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function CharCount({ value, ideal }: { value: string; ideal: number }) {
  const len = value.length;
  const tone =
    len === 0 ? "text-muted-foreground" : len > ideal ? "text-destructive" : "text-muted-foreground";
  return (
    <p className={`mt-1 text-[11px] ${tone}`}>
      {len} / ~{ideal} characters
    </p>
  );
}

function KeywordInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...value, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {value.map((k) => (
          <Badge key={k} variant="secondary" className="gap-1 pr-1">
            {k}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== k))}
              className="ml-0.5 rounded-full px-1 text-xs hover:bg-foreground/10"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="add keyword and press Enter"
      />
    </div>
  );
}
