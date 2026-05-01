import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { triggerReindex } from "@/server/assistantIndex.functions";
import { toast } from "sonner";
import { Sparkles, RefreshCw, PlayCircle, Save } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/assistant")({
  component: AssistantAdmin,
});

interface Source {
  id: string;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  max_items: number;
  top_k: number;
  weight: number;
  last_indexed_at: string | null;
  last_chunk_count: number;
  last_error: string | null;
}

interface Settings {
  id: string;
  system_prompt: string;
  model: string;
  embedding_model: string;
  max_context_chunks: number;
  similarity_threshold: number;
  updated_at: string;
}

interface Run {
  id: string;
  trigger: string;
  source_keys: string[];
  started_at: string;
  finished_at: string | null;
  chunks_total: number;
  chunks_inserted: number;
  chunks_updated: number;
  chunks_unchanged: number;
  chunks_deleted: number;
  error: string | null;
}

function AssistantAdmin() {
  const [sources, setSources] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState(0.3);
  const [maxCtxDraft, setMaxCtxDraft] = useState(18);
  const [runs, setRuns] = useState<Run[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reindexFn = useServerFn(triggerReindex);

  const load = useCallback(async () => {
    setLoading(true);
    const [srcRes, setRes, runRes, countRes] = await Promise.all([
      supabase.from("assistant_sources").select("*").order("label"),
      supabase.from("assistant_settings").select("*").eq("singleton", true).maybeSingle(),
      supabase.from("assistant_reindex_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("knowledge_chunks").select("*", { count: "exact", head: true }),
    ]);
    if (srcRes.error) toast.error(srcRes.error.message);
    setSources((srcRes.data ?? []) as Source[]);
    if (setRes.data) {
      setSettings(setRes.data as Settings);
      setPromptDraft(setRes.data.system_prompt);
      setModelDraft(setRes.data.model);
      setThresholdDraft(Number(setRes.data.similarity_threshold));
      setMaxCtxDraft(setRes.data.max_context_chunks);
    }
    setRuns((runRes.data ?? []) as Run[]);
    setTotalChunks(countRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateSource = async (id: string, patch: Partial<Source>) => {
    const { error } = await supabase.from("assistant_sources").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const reindex = async (only?: string[]) => {
    setReindexing(true);
    try {
      const res = await reindexFn({ data: { sourceKeys: only as never } });
      if (res.ok) {
        toast.success(`Reindex complete: +${res.chunksInserted} new, ${res.chunksUpdated} updated, ${res.chunksUnchanged} unchanged, ${res.chunksDeleted} removed`);
      } else {
        toast.error(`Reindex failed: ${res.error}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingPrompt(true);
    const { error } = await supabase
      .from("assistant_settings")
      .update({
        system_prompt: promptDraft,
        model: modelDraft,
        similarity_threshold: thresholdDraft,
        max_context_chunks: maxCtxDraft,
      })
      .eq("id", settings.id);
    setSavingPrompt(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Assistant settings saved");
    await load();
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Assistant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure data sources, reindex the knowledge base, and edit the assistant's system prompt.
            Index currently holds <strong>{totalChunks}</strong> chunks.
          </p>
        </div>
        <button
          onClick={() => reindex()}
          disabled={reindexing || loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {reindexing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {reindexing ? "Reindexing…" : "Reindex all enabled"}
        </button>
      </header>

      <details className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-foreground">How the index works</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>For each enabled source we pull rows from the database and build a citation-ready text chunk per row.</li>
          <li>We hash the text. If it matches the existing chunk we skip — no re-write.</li>
          <li>New / changed text is stored in <code>knowledge_chunks</code> and indexed by Postgres full-text search.</li>
          <li>Rows that no longer exist in the source are removed from the index.</li>
          <li>At chat time, the user's question is matched against the index and the top <code>max context chunks</code> are sent as grounding context to the assistant.</li>
        </ol>
      </details>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Data sources</h2>
          <button
            onClick={() => reindex(Array.from(selected))}
            disabled={reindexing || selected.size === 0}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            Reindex selected ({selected.size})
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2"></th>
                <th className="py-1.5 pr-2">Source</th>
                <th className="py-1.5 pr-2">Enabled</th>
                <th className="py-1.5 pr-2">Max items</th>
                <th className="py-1.5 pr-2">Top K</th>
                <th className="py-1.5 pr-2">Last indexed</th>
                <th className="py-1.5 pr-2">Chunks</th>
                <th className="py-1.5 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.key)}
                      onChange={(e) => setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.key); else next.delete(s.key);
                        return next;
                      })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <div className="font-medium text-foreground">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground">{s.description}</div>
                    {s.last_error ? (
                      <div className="mt-1 text-[11px] text-destructive">⚠ {s.last_error}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">
                    <button
                      onClick={() => updateSource(s.id, { enabled: !s.enabled })}
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                        (s.enabled
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                      }
                    >
                      {s.enabled ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={s.max_items}
                      onChange={(e) => updateSource(s.id, { max_items: Number(e.target.value) })}
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={s.top_k}
                      onChange={(e) => updateSource(s.id, { top_k: Number(e.target.value) })}
                      className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground text-xs">
                    {s.last_indexed_at ? formatDistanceToNow(new Date(s.last_indexed_at)) + " ago" : "never"}
                  </td>
                  <td className="py-2 pr-2 text-foreground">{s.last_chunk_count}</td>
                  <td className="py-2 pr-2 text-right">
                    <button
                      onClick={() => reindex([s.key])}
                      disabled={reindexing}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      Reindex
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold text-foreground">Assistant settings</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Max context chunks</span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxCtxDraft}
              onChange={(e) => setMaxCtxDraft(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted-foreground">System prompt</span>
          <textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <button
            onClick={saveSettings}
            disabled={savingPrompt}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {savingPrompt ? "Saving…" : "Save settings"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold text-foreground">Recent reindex runs</h2>
        <div className="mt-3 space-y-2 text-sm">
          {runs.length === 0 ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : runs.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{r.trigger}</span>
                <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.started_at))} ago</span>
                <span className="text-muted-foreground">·</span>
                <span>{r.chunks_total} total · +{r.chunks_inserted} new · {r.chunks_updated} updated · {r.chunks_unchanged} unchanged · {r.chunks_deleted} removed</span>
                {r.source_keys.length ? (
                  <span className="text-muted-foreground">· {r.source_keys.join(", ")}</span>
                ) : null}
              </div>
              {r.error ? <div className="mt-1 text-destructive">⚠ {r.error}</div> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
