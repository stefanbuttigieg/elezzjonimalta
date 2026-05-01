import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, UserRound, Flag, FileText, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocale, type Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";

type Kind = "candidate" | "party" | "proposal" | "district";

type Hit = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string | null;
  to: string;
  params: Record<string, string>;
  accent?: string | null;
};

const ICON: Record<Kind, typeof UserRound> = {
  candidate: UserRound,
  party: Flag,
  proposal: FileText,
  district: MapPin,
};

function pick(en: string | null | undefined, mt: string | null | undefined, locale: Locale): string {
  if (locale === "mt") return (mt && mt.trim()) || en || "";
  return en || mt || "";
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function CommandPalette({ lang: rawLang }: { lang: string }) {
  const t = useT();
  const navigate = useNavigate();
  const lang: Locale = isLocale(rawLang) ? rawLang : "en";

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global open shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Debounced search. We intentionally DO NOT clear hits between keystrokes
  // so a fast typist doesn't see a flash of "No results" while a new query is
  // in flight — the previous results stay visible until the new ones arrive.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      const like = `%${escapeLike(term)}%`;
      try {
        const [c, p, r, d] = await Promise.all([
          // Candidates: text match AND (published OR sitting MP).
          // Using a single `.or()` with an embedded `and(...)` keeps PostgREST's
          // boolean grouping unambiguous instead of chaining two `.or()` calls.
          supabase
            .from("candidates")
            .select("id, slug, full_name, status, is_incumbent, party:parties(name_en, name_mt, color)")
            .or(
              `and(status.eq.published,or(full_name.ilike.${like},bio_en.ilike.${like},bio_mt.ilike.${like})),` +
                `and(is_incumbent.eq.true,or(full_name.ilike.${like},bio_en.ilike.${like},bio_mt.ilike.${like}))`,
            )
            .limit(10),
          supabase
            .from("parties")
            .select("id, slug, name_en, name_mt, short_name, color")
            .eq("status", "published")
            .or(
              `name_en.ilike.${like},name_mt.ilike.${like},short_name.ilike.${like},description_en.ilike.${like},description_mt.ilike.${like}`,
            )
            .limit(8),
          supabase
            .from("proposals")
            .select(
              "id, title_en, title_mt, category, party:parties(name_en, name_mt, color), candidate:candidates(full_name)",
            )
            .eq("status", "published")
            .or(
              `title_en.ilike.${like},title_mt.ilike.${like},description_en.ilike.${like},description_mt.ilike.${like},category.ilike.${like}`,
            )
            .limit(20),
          supabase
            .from("districts")
            .select("id, number, name_en, name_mt, localities_en, localities_mt")
            .eq("status", "published")
            .or(
              `name_en.ilike.${like},name_mt.ilike.${like},localities_en.ilike.${like},localities_mt.ilike.${like}`,
            )
            .limit(8),
        ]);

        if (cancelled) return;

        if (c.error) console.error("[search] candidates", c.error);
        if (p.error) console.error("[search] parties", p.error);
        if (r.error) console.error("[search] proposals", r.error);
        if (d.error) console.error("[search] districts", d.error);

        const out: Hit[] = [];
        for (const row of c.data ?? []) {
          const party = (row as any).party;
          out.push({
            id: `c-${row.id}`,
            kind: "candidate",
            title: row.full_name,
            subtitle: party ? pick(party.name_en, party.name_mt, lang) : null,
            to: "/$lang/candidates/$slug",
            params: { lang, slug: row.slug },
            accent: party?.color ?? null,
          });
        }
        for (const row of p.data ?? []) {
          out.push({
            id: `p-${row.id}`,
            kind: "party",
            title: pick(row.name_en, row.name_mt, lang),
            subtitle: row.short_name ?? null,
            to: "/$lang/parties/$slug",
            params: { lang, slug: row.slug },
            accent: row.color ?? null,
          });
        }
        for (const row of r.data ?? []) {
          const party = (row as any).party;
          const cand = (row as any).candidate;
          const sub: string[] = [];
          if (row.category) sub.push(row.category);
          if (party) sub.push(pick(party.name_en, party.name_mt, lang));
          else if (cand) sub.push(cand.full_name);
          out.push({
            id: `r-${row.id}`,
            kind: "proposal",
            title: pick(row.title_en, row.title_mt, lang),
            subtitle: sub.join(" · ") || null,
            to: "/$lang/proposals",
            params: { lang },
            accent: party?.color ?? null,
          });
        }

        for (const row of d.data ?? []) {
          const name = pick(row.name_en, row.name_mt, lang) || `District ${row.number}`;
          const localities = pick(row.localities_en, row.localities_mt, lang);
          out.push({
            id: `d-${row.id}`,
            kind: "district",
            title: `${row.number}. ${name}`,
            subtitle: localities ? localities.slice(0, 80) : null,
            to: "/$lang/my-district/$number",
            params: { lang, number: String(row.number) },
            accent: null,
          });
        }

        // Title-match first
        const lower = term.toLowerCase();
        out.sort((a, b) => {
          const aT = a.title.toLowerCase().includes(lower) ? 0 : 1;
          const bT = b.title.toLowerCase().includes(lower) ? 0 : 1;
          return aT - bT;
        });

        setHits(out);
        setActive(0);
      } catch (err) {
        if (!cancelled) console.error("[search] failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, open, lang]);

  const seeAllHref = useMemo(
    () => ({ to: "/$lang/search" as const, params: { lang }, search: { q: q.trim(), type: "all" as const } }),
    [lang, q],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits.length === 0 || active >= hits.length) {
        if (q.trim().length >= 1) {
          setOpen(false);
          void navigate(seeAllHref);
        }
        return;
      }
      const hit = hits[active];
      setOpen(false);
      void navigate({ to: hit.to, params: hit.params } as any);
    }
  };

  // Listen for header search box "/" focus key etc. — handled elsewhere
  // Allow other components to open via custom event
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("elezzjoni:open-command-palette", open);
    return () => window.removeEventListener("elezzjoni:open-command-palette", open);
  }, []);

  if (!open) return null;

  const placeholder = t("cmdk.placeholder") !== "cmdk.placeholder"
    ? t("cmdk.placeholder")
    : lang === "mt"
      ? "Fittex kandidati, partiti, proposti…"
      : "Search candidates, parties, proposals…";

  const seeAllLabel = t("cmdk.seeAll") !== "cmdk.seeAll"
    ? t("cmdk.seeAll")
    : lang === "mt"
      ? "Ara r-riżultati kollha"
      : "See all results";

  const emptyLabel = t("cmdk.empty") !== "cmdk.empty"
    ? t("cmdk.empty")
    : lang === "mt"
      ? "L-ebda riżultat."
      : "No results.";

  const hintLabel = t("cmdk.hint") !== "cmdk.hint"
    ? t("cmdk.hint")
    : lang === "mt"
      ? "Ittajpja mill-inqas 2 ittri biex tibda."
      : "Type at least 2 characters to start.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={placeholder}
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[12vh] backdrop-blur"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            type="search"
            aria-label={placeholder}
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{hintLabel}</p>
          ) : hits.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <ul role="listbox" className="py-1">
              {hits.map((hit, idx) => {
                const Icon = ICON[hit.kind];
                const isActive = idx === active;
                return (
                  <li key={hit.id}>
                    <Link
                      to={hit.to}
                      params={hit.params as any}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => setOpen(false)}
                      className={
                        "flex items-start gap-3 px-3 py-2 text-sm " +
                        (isActive ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60")
                      }
                      aria-selected={isActive}
                    >
                      <span
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface"
                        style={hit.accent ? { borderColor: hit.accent } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 self-center text-[10px] uppercase tracking-wider text-muted-foreground">
                        {hit.kind}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {q.trim().length >= 1 ? (
          <div className="border-t border-border bg-surface px-3 py-2 text-xs">
            <Link
              to={seeAllHref.to}
              params={seeAllHref.params}
              search={seeAllHref.search}
              onClick={() => setOpen(false)}
              className={
                "flex items-center justify-between rounded px-2 py-1.5 " +
                (active === hits.length ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/60")
              }
            >
              <span>{seeAllLabel} "{q.trim()}"</span>
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
