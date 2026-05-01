import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History } from "lucide-react";
import { toast } from "sonner";

interface AuditEntry {
  id: string;
  action: string;
  actor_email: string | null;
  note: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

const TRACKED_FIELDS = [
  "title_en",
  "title_mt",
  "description_en",
  "description_mt",
  "category",
  "party_id",
  "candidate_id",
  "status",
  "source_url",
  "notes",
];

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return [] as Array<{ field: string; from: unknown; to: unknown }>;
  const out: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const f of TRACKED_FIELDS) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, from: a, to: b });
  }
  return out;
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return <em className="text-muted-foreground">empty</em>;
  if (typeof v === "string" && v.length > 80) return v.slice(0, 80) + "…";
  return String(v);
}

export function ProposalHistorySection({ proposalId }: { proposalId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!proposalId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, action, actor_email, note, before, after, created_at")
        .eq("entity_type", "proposal")
        .eq("entity_id", proposalId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) toast.error(error.message);
      setEntries((data ?? []) as unknown as AuditEntry[]);
      setLoading(false);
    })();
  }, [proposalId]);

  return (
    <section className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" /> Update history ({entries.length})
      </h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No edits recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => {
            const changes = diffFields(e.before, e.after);
            return (
              <li key={e.id} className="rounded-md border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium capitalize">{e.action.replace(/_/g, " ")}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                    {e.actor_email ? ` · ${e.actor_email}` : ""}
                  </div>
                </div>
                {e.note ? (
                  <div className="mt-1 text-xs italic text-muted-foreground">“{e.note}”</div>
                ) : null}
                {changes.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {changes.map((c) => (
                      <li key={c.field} className="flex flex-wrap gap-1">
                        <span className="font-mono font-semibold">{c.field}:</span>
                        <span className="text-muted-foreground line-through">{fmt(c.from)}</span>
                        <span>→</span>
                        <span>{fmt(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
