import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reviewCandidateSuggestion } from "@/lib/candidateSuggestions.functions";
import { toast } from "sonner";
import { Check, X, ExternalLink, RefreshCw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/candidate-suggestions")({
  head: () => ({
    meta: [
      { title: "AI candidate suggestions — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SuggestionsPage,
});

type Suggestion = {
  id: string;
  candidate_id: string;
  field_key: string;
  current_value: string | null;
  suggested_value: string;
  source_urls: string[];
  ai_model: string | null;
  ai_confidence: string | null;
  ai_reason: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  created_at: string;
  reviewed_at: string | null;
  candidate: { id: string; full_name: string; slug: string } | null;
};

const STATUS_OPTIONS = ["pending", "approved", "rejected", "superseded"] as const;

function SuggestionsPage() {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("pending");
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidate_field_suggestions")
      .select(
        "id, candidate_id, field_key, current_value, suggested_value, source_urls, ai_model, ai_confidence, ai_reason, status, created_at, reviewed_at, candidate:candidates(id, full_name, slug)"
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Suggestion[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      const res = await reviewCandidateSuggestion({ data: { suggestion_id: id, action } });
      if (!res.ok) throw new Error(res.error);
      toast.success(action === "approve" ? "Applied to candidate" : "Rejected");
      setRows((r) => r.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.candidate?.full_name.toLowerCase().includes(q) ||
      r.field_key.toLowerCase().includes(q) ||
      r.suggested_value.toLowerCase().includes(q)
    );
  });

  // Group by candidate
  const grouped = filtered.reduce<Record<string, Suggestion[]>>((acc, s) => {
    const key = s.candidate?.id ?? s.candidate_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-primary" />
            AI candidate suggestions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Findings from the AI discovery agent. Approve to apply to the candidate, reject to discard.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium capitalize " +
              (status === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-accent")
            }
          >
            {s}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by candidate, field, value…"
          className="ml-auto w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          No {status} suggestions. Run the AI discovery agent from a candidate's edit drawer or the bulk action on /admin/candidates.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(grouped).map(([cid, list]) => {
            const cand = list[0].candidate;
            return (
              <section key={cid} className="rounded-2xl border border-border bg-surface shadow-card">
                <header className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div>
                    <h2 className="font-serif text-lg font-semibold text-foreground">
                      {cand?.full_name ?? "Unknown candidate"}
                    </h2>
                    <p className="text-xs text-muted-foreground">{list.length} suggestion(s)</p>
                  </div>
                  {cand?.slug ? (
                    <Link
                      to="/$lang/candidates/$slug"
                      params={{ lang: "en", slug: cand.slug }}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View profile <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </header>
                <ul className="divide-y divide-border">
                  {list.map((s) => (
                    <li key={s.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {s.field_key}
                          </p>
                          {s.current_value ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-semibold">Current:</span>{" "}
                              <span className="line-through">{s.current_value.slice(0, 200)}</span>
                            </p>
                          ) : (
                            <p className="mt-1 text-xs italic text-muted-foreground">
                              Current: (empty)
                            </p>
                          )}
                          <p className="mt-2 break-words text-sm text-foreground">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              Suggested:
                            </span>{" "}
                            {s.suggested_value}
                          </p>
                          {s.source_urls.length > 0 ? (
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                {s.source_urls.length} source(s)
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-4">
                                {s.source_urls.slice(0, 8).map((u) => (
                                  <li key={u}>
                                    <a
                                      href={u}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      {u}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </div>
                        {s.status === "pending" ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => void act(s.id, "approve")}
                              disabled={busy === s.id}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Apply
                            </button>
                            <button
                              onClick={() => void act(s.id, "reject")}
                              disabled={busy === s.id}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            {s.status}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
