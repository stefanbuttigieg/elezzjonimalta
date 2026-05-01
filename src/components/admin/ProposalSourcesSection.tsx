import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ProposalSource {
  id: string;
  proposal_id: string;
  url: string;
  label: string | null;
  note: string | null;
  created_at: string;
}

export function ProposalSourcesSection({ proposalId }: { proposalId: string }) {
  const [sources, setSources] = useState<ProposalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

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

  const add = async () => {
    if (!url.trim()) {
      toast.error("URL is required");
      return;
    }
    setAdding(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("proposal_sources" as never).insert({
        proposal_id: proposalId,
        url: url.trim(),
        label: label.trim() || null,
        note: note.trim() || null,
        added_by: userRes.user?.id ?? null,
      } as never);
      if (error) throw error;
      setUrl("");
      setLabel("");
      setNote("");
      toast.success("Source added");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add source");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this source?")) return;
    const { error } = await supabase.from("proposal_sources" as never).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    void load();
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4" /> Source URLs ({sources.length})
      </h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">No additional sources yet.</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {s.label ? <span className="font-medium">{s.label}</span> : null}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 truncate text-primary hover:underline"
                  >
                    <span className="truncate">{s.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                {s.note ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.note}</div>
                ) : null}
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Added {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => remove(s.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Manifesto)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={add}
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
    </section>
  );
}
