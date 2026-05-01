import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Layers, GitMerge } from "lucide-react";
import { groupDuplicates, type ProposalForMatch } from "@/lib/proposal-dedupe";
import { mergeProposals, type ProposalRowForMerge } from "@/lib/proposal-merge";

export const Route = createFileRoute("/admin/duplicates")({
  component: DuplicatesAdmin,
});

interface Row extends ProposalForMatch, ProposalRowForMerge {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  source_url: string | null;
  notes: string | null;
  party_id: string | null;
  candidate_id: string | null;
  status: string;
  merged_into_id: string | null;
}

function DuplicatesAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.55);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [noteByGroup, setNoteByGroup] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select(
        "id,title_en,title_mt,description_en,description_mt,source_url,notes,party_id,candidate_id,status,merged_into_id"
      );
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => groupDuplicates<Row>(rows, threshold), [rows, threshold]);

  const handleMerge = async (groupKey: string, group: Row[]) => {
    const primaryId = primaryByGroup[groupKey] ?? group[0].id;
    const primary = group.find((g) => g.id === primaryId);
    if (!primary) return;
    const dupes = group.filter((g) => g.id !== primaryId);
    if (dupes.length === 0) return;
    if (!confirm(`Merge ${dupes.length} proposal(s) into "${primary.title_en}"? Duplicates will be archived.`))
      return;
    setBusy(groupKey);
    try {
      await mergeProposals({
        primary,
        duplicates: dupes,
        note: noteByGroup[groupKey] ?? "",
      });
      toast.success("Merged");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Duplicate proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Likely duplicates grouped by similarity. Pick a primary and merge — others become archived
            with a link back and an audit log entry.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sensitivity
          <input
            type="range"
            min={0.3}
            max={0.85}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span className="font-mono text-xs">{threshold.toFixed(2)}</span>
        </label>
      </header>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Scanning…</p>
      ) : groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground">
          <Layers className="mx-auto mb-2 h-6 w-6" />
          No duplicate clusters found at this sensitivity.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {groups.map((group) => {
            const key = group.map((g) => g.id).sort().join(":");
            const primaryId = primaryByGroup[key] ?? group[0].id;
            return (
              <div key={key} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cluster of {group.length}
                </div>
                <ul className="space-y-2">
                  {group.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                      <input
                        type="radio"
                        name={`primary-${key}`}
                        checked={primaryId === p.id}
                        onChange={() => setPrimaryByGroup((s) => ({ ...s, [key]: p.id }))}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{p.title_en}</div>
                        {p.title_mt ? (
                          <div className="text-xs text-muted-foreground">{p.title_mt}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          status: {p.status}
                          {p.source_url ? (
                            <>
                              {" · "}
                              <a href={p.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                source
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <input
                  value={noteByGroup[key] ?? ""}
                  onChange={(e) => setNoteByGroup((s) => ({ ...s, [key]: e.target.value }))}
                  placeholder="Merge note (e.g. 'Same policy, different wording')"
                  className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    disabled={busy === key}
                    onClick={() => handleMerge(key, group)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <GitMerge className="h-4 w-4" />
                    {busy === key ? "Merging…" : "Merge into selected primary"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
