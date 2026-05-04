import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Layers, GitMerge, X, RotateCcw } from "lucide-react";
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

interface PartyLite {
  id: string;
  name_en: string;
  short_name: string | null;
  color: string | null;
}
interface CandidateLite {
  id: string;
  full_name: string;
}

const DISMISS_KEY = "admin:duplicates:dismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

function DuplicatesAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [parties, setParties] = useState<Map<string, PartyLite>>(new Map());
  const [candidates, setCandidates] = useState<Map<string, CandidateLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.55);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [noteByGroup, setNoteByGroup] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [showDismissed, setShowDismissed] = useState(false);

  const load = async () => {
    setLoading(true);
    const [propRes, partyRes, candRes] = await Promise.all([
      supabase
        .from("proposals")
        .select(
          "id,title_en,title_mt,description_en,description_mt,source_url,notes,party_id,candidate_id,status,merged_into_id"
        ),
      supabase.from("parties").select("id, name_en, short_name, color"),
      supabase.from("candidates").select("id, full_name"),
    ]);
    if (propRes.error) toast.error(propRes.error.message);
    setRows((propRes.data ?? []) as Row[]);
    setParties(new Map(((partyRes.data ?? []) as PartyLite[]).map((p) => [p.id, p])));
    setCandidates(new Map(((candRes.data ?? []) as CandidateLite[]).map((c) => [c.id, c])));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const allGroups = useMemo(() => groupDuplicates<Row>(rows, threshold), [rows, threshold]);
  const groups = useMemo(
    () =>
      allGroups.filter((g) => {
        const key = g.map((x) => x.id).sort().join(":");
        return showDismissed ? dismissed.has(key) : !dismissed.has(key);
      }),
    [allGroups, dismissed, showDismissed]
  );
  const dismissedCount = useMemo(
    () =>
      allGroups.filter((g) => dismissed.has(g.map((x) => x.id).sort().join(":"))).length,
    [allGroups, dismissed]
  );

  const logAudit = async (action: "duplicate_cluster_dismiss" | "duplicate_cluster_restore", key: string, ids: string[]) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("admin_audit_log").insert({
        entity_type: "proposals",
        entity_id: ids[0] ?? null,
        action,
        actor_id: u.user?.id ?? null,
        actor_email: u.user?.email ?? null,
        metadata: { cluster_key: key, proposal_ids: ids, threshold },
      } as never);
    } catch (e) {
      console.error("audit log failed", e);
    }
  };

  const dismissGroup = (key: string, ids: string[]) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveDismissed(next);
      return next;
    });
    void logAudit("duplicate_cluster_dismiss", key, ids);
    toast.success("Cluster dismissed");
  };

  const restoreGroup = (key: string, ids: string[]) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      saveDismissed(next);
      return next;
    });
    void logAudit("duplicate_cluster_restore", key, ids);
  };


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
            Likely duplicates grouped by similarity. Pick a primary and merge — or dismiss the
            cluster if these aren't actually duplicates.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {dismissedCount > 0 ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
              />
              Show dismissed ({dismissedCount})
            </label>
          ) : null}
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
        </div>
      </header>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Scanning…</p>
      ) : groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground">
          <Layers className="mx-auto mb-2 h-6 w-6" />
          {showDismissed
            ? "No dismissed clusters at this sensitivity."
            : "No duplicate clusters found at this sensitivity."}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {groups.map((group) => {
            const key = group.map((g) => g.id).sort().join(":");
            const primaryId = primaryByGroup[key] ?? group[0].id;
            const isDismissed = dismissed.has(key);
            return (
              <div
                key={key}
                className={
                  "rounded-xl border border-border bg-surface p-4 shadow-card " +
                  (isDismissed ? "opacity-60" : "")
                }
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cluster of {group.length}
                    {isDismissed ? " · dismissed" : ""}
                  </span>
                  {isDismissed ? (
                    <button
                      onClick={() => restoreGroup(key, group.map((g) => g.id))}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => dismissGroup(key, group.map((g) => g.id))}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                      title="Hide this cluster — it isn't a real duplicate"
                    >
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {group.map((p) => {
                    const party = p.party_id ? parties.get(p.party_id) : null;
                    const candidate = p.candidate_id ? candidates.get(p.candidate_id) : null;
                    return (
                      <li
                        key={p.id}
                        className="flex items-start gap-3 rounded-md border border-border p-3"
                      >
                        <input
                          type="radio"
                          name={`primary-${key}`}
                          checked={primaryId === p.id}
                          onChange={() => setPrimaryByGroup((s) => ({ ...s, [key]: p.id }))}
                          className="mt-1"
                          disabled={isDismissed}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{p.title_en}</div>
                          {p.title_mt ? (
                            <div className="text-xs text-muted-foreground">{p.title_mt}</div>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                            {party ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium"
                                style={
                                  party.color
                                    ? {
                                        borderColor: party.color,
                                        color: party.color,
                                      }
                                    : undefined
                                }
                              >
                                🏛 {party.short_name ?? party.name_en}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">
                                No party
                              </span>
                            )}
                            {candidate ? (
                              <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                                👤 {candidate.full_name}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground">· {p.status}</span>
                            {p.source_url ? (
                              <a
                                href={p.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                              >
                                source
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!isDismissed ? (
                  <>
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
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
