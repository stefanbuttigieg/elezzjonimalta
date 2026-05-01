import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerActions, Field, Input, Textarea } from "@/routes/admin.parties";
import { Plus, Pencil, Trash2, Search, RefreshCw, ExternalLink, HelpCircle, Languages } from "lucide-react";
import { toast } from "sonner";
import { triggerFaqSync, translateFaqToEnglish } from "@/server/votingFaqSync.functions";

export const Route = createFileRoute("/admin/voting-faqs")({
  component: VotingFaqsAdmin,
});

interface Faq {
  id: string;
  source_key: string;
  source_label: string;
  source_url: string;
  question_en: string | null;
  answer_en: string | null;
  question_mt: string | null;
  answer_mt: string | null;
  sort_order: number;
  status: "draft" | "pending_review" | "published" | "archived";
  last_synced_at: string | null;
}

interface SyncRun {
  id: string;
  source_key: string;
  started_at: string;
  finished_at: string | null;
  items_found: number;
  items_added: number;
  items_updated: number;
  error: string | null;
}

const SOURCE_OPTIONS = [
  { key: "intmalta", label: "intmalta.com" },
  { key: "pn_mt", label: "PN — Maltese" },
  { key: "pn_en", label: "PN — English" },
] as const;

const empty: Faq = {
  id: "",
  source_key: "intmalta",
  source_label: "intmalta.com",
  source_url: "https://intmalta.com/faq/",
  question_en: "",
  answer_en: "",
  question_mt: "",
  answer_mt: "",
  sort_order: 0,
  status: "published",
  last_synced_at: null,
};

function VotingFaqsAdmin() {
  const [rows, setRows] = useState<Faq[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [q, setQ] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [editing, setEditing] = useState<Faq | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [faqsRes, runsRes] = await Promise.all([
      supabase.from("voting_faqs").select("*").order("source_key").order("sort_order"),
      supabase
        .from("voting_faq_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);
    if (faqsRes.error) toast.error(faqsRes.error.message);
    setRows((faqsRes.data ?? []) as Faq[]);
    setRuns((runsRes.data ?? []) as SyncRun[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filterSource !== "all" && r.source_key !== filterSource) return false;
        if (!q) return true;
        const hay = `${r.question_en} ${r.answer_en} ${r.question_mt ?? ""} ${r.answer_mt ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      }),
    [rows, q, filterSource]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Faq[]>();
    for (const r of filtered) {
      const arr = map.get(r.source_key) ?? [];
      arr.push(r);
      map.set(r.source_key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleSync = async (sourceKey?: string) => {
    setSyncing(sourceKey ?? "all");
    try {
      const result = await triggerFaqSync({
        data: sourceKey ? { sourceKey: sourceKey as never } : {},
      });
      if (!result.ok) {
        toast.error(`Sync failed: ${result.error}`);
      } else {
        const totals = result.results.reduce(
          (acc, r) => ({
            found: acc.found + r.found,
            added: acc.added + r.added,
            updated: acc.updated + r.updated,
            errors: acc.errors + (r.error ? 1 : 0),
          }),
          { found: 0, added: 0, updated: 0, errors: 0 }
        );
        if (totals.errors > 0) {
          toast.warning(
            `Synced with ${totals.errors} error(s). Added ${totals.added}, updated ${totals.updated}.`
          );
        } else {
          toast.success(
            `Sync complete: ${totals.added} added, ${totals.updated} updated (${totals.found} found).`
          );
        }
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(null);
    }
  };

  const handleTranslate = async (id: string) => {
    setTranslatingId(id);
    try {
      const res = await translateFaqToEnglish({ data: { faqId: id } });
      if (!res.ok) {
        toast.error(`Translation failed: ${res.error}`);
      } else {
        toast.success("Translated to English.");
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, question_en: res.question_en, answer_en: res.answer_en } : r,
          ),
        );
        if (editing?.id === id) {
          setEditing({ ...editing, question_en: res.question_en, answer_en: res.answer_en });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingId(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    const qEn = (editing.question_en ?? "").trim();
    const aEn = (editing.answer_en ?? "").trim();
    const qMt = (editing.question_mt ?? "").trim();
    const aMt = (editing.answer_mt ?? "").trim();
    if ((!qEn || !aEn) && (!qMt || !aMt)) {
      toast.error("Provide a question and answer in at least one language.");
      return;
    }
    const payload = {
      source_key: editing.source_key,
      source_label: editing.source_label,
      source_url: editing.source_url,
      question_en: qEn || null,
      answer_en: aEn || null,
      question_mt: qMt || null,
      answer_mt: aMt || null,
      sort_order: editing.sort_order,
      status: editing.status,
    };
    const res = editing.id
      ? await supabase.from("voting_faqs").update(payload).eq("id", editing.id)
      : await supabase.from("voting_faqs").insert(payload);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Saved");
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this FAQ entry?")) return;
    const { error } = await supabase.from("voting_faqs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">Voting FAQs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bilingual voting FAQs (EN/MT). Sync from external sources or edit manually.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void handleSync()}
            disabled={syncing !== null}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing === "all" ? "animate-spin" : ""}`} />
            {syncing === "all" ? "Re-syncing all…" : "Re-sync all sources"}
          </button>
          <button
            onClick={() => setEditing({ ...empty })}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> New FAQ
          </button>
        </div>
      </div>

      {/* Source cards with per-source sync */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCE_OPTIONS.map((src) => {
          const lastRun = runs.find((r) => r.source_key === src.key);
          const count = rows.filter((r) => r.source_key === src.key).length;
          return (
            <div
              key={src.key}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-foreground">{src.label}</div>
                  <div className="text-xs text-muted-foreground">{count} entries</div>
                </div>
                <button
                  onClick={() => void handleSync(src.key)}
                  disabled={syncing !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncing === src.key ? "animate-spin" : ""}`}
                  />
                  Sync
                </button>
              </div>
              {lastRun ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Last: {new Date(lastRun.started_at).toLocaleString()} —{" "}
                  {lastRun.error ? (
                    <span className="text-destructive">{lastRun.error}</span>
                  ) : (
                    <>+{lastRun.items_added} / ~{lastRun.items_updated}</>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search FAQs…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All sources</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No FAQs yet. Click <span className="font-medium">Re-sync all sources</span> to pull from
            the configured URLs.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([sourceKey, items]) => {
            const srcMeta = items[0];
            return (
              <section key={sourceKey}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {srcMeta.source_label}
                    <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/70">
                      ({items.length})
                    </span>
                  </h2>
                  <a
                    href={srcMeta.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" /> source
                  </a>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Question (EN)</th>
                        <th className="px-3 py-2 text-left">MT</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {items.map((r) => (
                        <tr key={r.id} className="hover:bg-accent/50">
                          <td className="px-3 py-2">
                            {r.question_en ? (
                              <>
                                <div className="font-medium text-foreground">{r.question_en}</div>
                                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {r.answer_en}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-muted-foreground italic">
                                  {r.question_mt ?? "—"}
                                </div>
                                <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                                  No English version yet
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.question_mt ? "✓" : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                                (r.status === "published"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {r.question_mt && !r.question_en ? (
                                <button
                                  onClick={() => void handleTranslate(r.id)}
                                  disabled={translatingId === r.id}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                                  aria-label="Translate to English"
                                  title="Translate to English"
                                >
                                  <Languages
                                    className={`h-3.5 w-3.5 ${translatingId === r.id ? "animate-pulse" : ""}`}
                                  />
                                  {translatingId === r.id ? "Translating…" : "Translate"}
                                </button>
                              ) : null}
                              <button
                                onClick={() => setEditing(r)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => void remove(r.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing ? (
        <Drawer
          onClose={() => setEditing(null)}
          title={editing.id ? "Edit FAQ" : "New FAQ"}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source">
                <select
                  value={editing.source_key}
                  onChange={(e) => {
                    const s = SOURCE_OPTIONS.find((o) => o.key === e.target.value)!;
                    setEditing({ ...editing, source_key: s.key, source_label: s.label });
                  }}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as Faq["status"] })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="pending_review">Pending review</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </div>
            <Field label="Source URL">
              <Input
                value={editing.source_url}
                onChange={(v) => setEditing({ ...editing, source_url: v })}
              />
            </Field>
            {editing.id && editing.question_mt && !editing.question_en ? (
              <button
                type="button"
                onClick={() => void handleTranslate(editing.id)}
                disabled={translatingId === editing.id}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <Languages
                  className={`h-4 w-4 ${translatingId === editing.id ? "animate-pulse" : ""}`}
                />
                {translatingId === editing.id
                  ? "Translating from Maltese…"
                  : "Translate from Maltese to English"}
              </button>
            ) : null}
            <Field label="Question (English)">
              <Input
                value={editing.question_en ?? ""}
                onChange={(v) => setEditing({ ...editing, question_en: v })}
              />
            </Field>
            <Field label="Answer (English)">
              <Textarea
                value={editing.answer_en ?? ""}
                onChange={(v) => setEditing({ ...editing, answer_en: v })}
              />
            </Field>
            <Field label="Question (Maltese)">
              <Input
                value={editing.question_mt ?? ""}
                onChange={(v) => setEditing({ ...editing, question_mt: v })}
              />
            </Field>
            <Field label="Answer (Maltese)">
              <Textarea
                value={editing.answer_mt ?? ""}
                onChange={(v) => setEditing({ ...editing, answer_mt: v })}
              />
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                value={String(editing.sort_order)}
                onChange={(v) =>
                  setEditing({ ...editing, sort_order: Number(v) || 0 })
                }
              />
            </Field>
          </div>
          <DrawerActions
            onClose={() => setEditing(null)}
            onSave={() => void save()}
            saving={false}
          />
        </Drawer>
      ) : null}
    </div>
  );
}
