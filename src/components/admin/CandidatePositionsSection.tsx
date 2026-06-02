import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import { classifyCandidatePositions } from "@/server-fns/positionClassify.functions";

export type PositionKind =
  | "prime_minister"
  | "deputy_pm"
  | "minister"
  | "parliamentary_secretary"
  | "cabinet_member"
  | "opposition_leader"
  | "shadow_minister"
  | "speaker"
  | "deputy_speaker"
  | "whip"
  | "committee_chair"
  | "committee_member"
  | "mep"
  | "other";

const KIND_LABELS: Record<PositionKind, string> = {
  prime_minister: "Prime Minister",
  deputy_pm: "Deputy PM",
  minister: "Minister",
  parliamentary_secretary: "Parliamentary Secretary",
  cabinet_member: "Cabinet Member",
  opposition_leader: "Opposition Leader",
  shadow_minister: "Shadow Minister",
  speaker: "Speaker",
  deputy_speaker: "Deputy Speaker",
  whip: "Whip",
  committee_chair: "Committee Chair",
  committee_member: "Committee Member",
  mep: "MEP",
  other: "Other",
};

interface Position {
  id: string;
  candidate_id: string;
  legislature_number: number | null;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  source_url: string | null;
  position_kind: PositionKind;
  portfolio: string | null;
}

const empty = (candidateId: string): Omit<Position, "id"> => ({
  candidate_id: candidateId,
  legislature_number: null,
  title: "",
  body: null,
  start_date: null,
  end_date: null,
  is_current: false,
  source_url: null,
  position_kind: "other",
  portfolio: null,
});

export function CandidatePositionsSection({ candidateId }: { candidateId: string }) {
  const [rows, setRows] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidate_positions")
      .select(
        "id, candidate_id, legislature_number, title, body, start_date, end_date, is_current, source_url, position_kind, portfolio"
      )
      .eq("candidate_id", candidateId)
      .order("start_date", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Position[]);
    setLoading(false);
  };

  useEffect(() => {
    if (candidateId) void reload();
  }, [candidateId]);

  const addRow = async () => {
    const { data, error } = await supabase
      .from("candidate_positions")
      .insert(empty(candidateId))
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((r) => [data as Position, ...r]);
  };

  const updateRow = async (id: string, patch: Partial<Position>) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const saveRow = async (row: Position) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("candidate_positions")
      .update({
        legislature_number: row.legislature_number,
        title: row.title,
        body: row.body,
        start_date: row.start_date,
        end_date: row.end_date,
        is_current: row.is_current,
        source_url: row.source_url,
        position_kind: row.position_kind,
        portfolio: row.portfolio,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) toast.error(error.message);
    else toast.success("Position saved");
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this position?")) return;
    const { error } = await supabase.from("candidate_positions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((r) => r.filter((row) => row.id !== id));
  };

  const aiClassify = async () => {
    if (classifying) return;
    setClassifying(true);
    try {
      const res = await classifyCandidatePositions({ data: { candidateId } });
      if (!res.ok) {
        toast.error(res.error ?? "AI classify failed");
      } else {
        toast.success(`Classified ${res.updated} of ${res.total} positions`);
        await reload();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI classify failed");
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Parliamentary & cabinet positions</h3>
          <p className="text-xs text-muted-foreground">
            Use the structured kind to power filters. Title + portfolio are display fields.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={aiClassify}
            disabled={classifying || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {classifying ? "Classifying…" : "AI classify all"}
          </button>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add position
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">No positions yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-muted/30 p-3">
              <select
                value={row.position_kind}
                onChange={(e) => updateRow(row.id, { position_kind: e.target.value as PositionKind })}
                className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                {(Object.keys(KIND_LABELS) as PositionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <input
                value={row.portfolio ?? ""}
                onChange={(e) => updateRow(row.id, { portfolio: e.target.value || null })}
                placeholder="Portfolio (e.g. Health)"
                className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                value={row.title}
                onChange={(e) => updateRow(row.id, { title: e.target.value })}
                placeholder="Display title"
                className="col-span-4 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                value={row.legislature_number ?? ""}
                onChange={(e) =>
                  updateRow(row.id, { legislature_number: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Leg #"
                className="col-span-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="date"
                value={row.start_date ?? ""}
                onChange={(e) => updateRow(row.id, { start_date: e.target.value || null })}
                className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="date"
                value={row.end_date ?? ""}
                onChange={(e) => updateRow(row.id, { end_date: e.target.value || null })}
                className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <label className="col-span-2 flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={row.is_current}
                  onChange={(e) => updateRow(row.id, { is_current: e.target.checked })}
                />
                Current
              </label>
              <input
                value={row.source_url ?? ""}
                onChange={(e) => updateRow(row.id, { source_url: e.target.value || null })}
                placeholder="Source URL"
                className="col-span-4 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <div className="col-span-12 flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => deleteRow(row.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => void saveRow(row)}
                  disabled={savingId === row.id}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="h-3 w-3" /> {savingId === row.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
