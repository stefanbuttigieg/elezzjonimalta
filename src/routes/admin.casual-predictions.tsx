import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Trash2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/casual-predictions")({
  component: CasualPredictionsAdminPage,
});

type Row = {
  id: string;
  election_year: number;
  full_name: string;
  district_number: number;
  computed_at: string;
  scenario: {
    quota?: number | null;
    predicted?: { name?: string; probability?: number } | null;
    contenders?: unknown[];
  } | null;
};

function CasualPredictionsAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [year, setYear] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [candidate, setCandidate] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("casual_predictions")
      .select("id, election_year, full_name, district_number, computed_at, scenario")
      .order("computed_at", { ascending: false })
      .limit(1000);

    if (year) q = q.eq("election_year", Number(year));
    if (district) q = q.eq("district_number", Number(district));
    if (candidate.trim()) q = q.ilike("full_name", `%${candidate.trim()}%`);

    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, district, candidate]);

  const { years, districts } = useMemo(() => {
    const y = new Set<number>();
    const d = new Set<number>();
    rows.forEach((r) => {
      y.add(r.election_year);
      d.add(r.district_number);
    });
    return {
      years: Array.from(y).sort((a, b) => b - a),
      districts: Array.from(d).sort((a, b) => a - b),
    };
  }, [rows]);

  const purgeOne = async (id: string) => {
    if (!confirm("Purge this cached prediction?")) return;
    setBusy(true);
    const { error: err } = await supabase.from("casual_predictions").delete().eq("id", id);
    setBusy(false);
    if (err) {
      alert(err.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const purgeFiltered = async () => {
    if (!confirm(`Purge ALL ${rows.length} cached predictions matching the current filters?`))
      return;
    setBusy(true);
    let q = supabase.from("casual_predictions").delete();
    if (year) q = q.eq("election_year", Number(year));
    if (district) q = q.eq("district_number", Number(district));
    if (candidate.trim()) q = q.ilike("full_name", `%${candidate.trim()}%`);
    // If no filters at all, require id list to avoid wiping everything by accident
    if (!year && !district && !candidate.trim()) {
      const ids = rows.map((r) => r.id);
      q = supabase.from("casual_predictions").delete().in("id", ids);
    }
    const { error: err } = await q;
    setBusy(false);
    if (err) {
      alert(err.message);
      return;
    }
    void load();
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Casual prediction cache</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cached results from the casual election simulator. Purge entries to force recomputation
            on the next page load.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void purgeFiltered()}
            disabled={busy || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Purge {rows.length} shown
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              District {d}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={candidate}
          onChange={(e) => setCandidate(e.target.value)}
          placeholder="Search candidate name…"
          className="min-w-[240px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error ? (
        <p className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Computed</th>
                <th className="px-4 py-3 font-semibold">Year</th>
                <th className="px-4 py-3 font-semibold">District</th>
                <th className="px-4 py-3 font-semibold">Candidate</th>
                <th className="px-4 py-3 font-semibold">Predicted</th>
                <th className="px-4 py-3 font-semibold">Quota</th>
                <th className="px-4 py-3 font-semibold">Contenders</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Sparkles className="mx-auto mb-2 h-6 w-6" />
                    No cached predictions for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const predicted = r.scenario?.predicted;
                  const probPct =
                    predicted && typeof predicted.probability === "number"
                      ? `${Math.round(predicted.probability * 100)}%`
                      : "—";
                  return (
                    <tr key={r.id} className="hover:bg-accent/30">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(r.computed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.election_year}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.district_number}</td>
                      <td className="px-4 py-2.5 font-medium">{r.full_name}</td>
                      <td className="px-4 py-2.5">
                        {predicted?.name ? (
                          <span>
                            {predicted.name}{" "}
                            <span className="text-xs text-muted-foreground">({probPct})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {r.scenario?.quota ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {Array.isArray(r.scenario?.contenders) ? r.scenario!.contenders!.length : 0}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void purgeOne(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Purge
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
