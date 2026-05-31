// Bulk editor for the `elected` flag (and first-count votes) on candidate_districts.
// - Pick an election year (default 2026), then edit a single grid of all
//   contesting candidate × district rows.
// - Filters by district, party, name, elected state, "modified only".
// - Per-row checkbox + votes input, plus bulk "mark selected as elected/not".
// - CSV export of current rows.
// - CSV import: candidate_slug,district_number,elected[,votes_first_count].
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Save, Loader2, CheckSquare, Square, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/elected")({
  component: ElectedBulkEditor,
});

interface Row {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_slug: string;
  party_name: string | null;
  party_id: string | null;
  district_id: string;
  district_number: number;
  district_name: string;
  election_year: number;
  elected: boolean;
  initial_elected: boolean;
  elected_via_gcm: boolean;
  initial_elected_via_gcm: boolean;
  elected_via_proportionality: boolean;
  initial_elected_via_proportionality: boolean;
  votes: string; // string so empty = null
  initial_votes: string;
}

type DistrictOpt = { id: string; number: number; name_en: string };
type PartyOpt = { id: string; name: string };

const YEARS = [2026, 2022, 2017, 2013];

function ElectedBulkEditor() {
  const [year, setYear] = useState<number>(2026);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [parties, setParties] = useState<PartyOpt[]>([]);

  // filters
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [electedFilter, setElectedFilter] = useState<"all" | "elected" | "not" | "gcm" | "prop">("all");
  const [modifiedOnly, setModifiedOnly] = useState(false);

  // selection for bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSelected(new Set());
      try {
        const { data, error } = await supabase
          .from("candidate_districts")
          .select(
            "id, candidate_id, district_id, election_year, elected, elected_via_gcm, elected_via_proportionality, votes_first_count, " +
              "candidates!inner(full_name, slug, party_id, parties(name_en)), " +
              "districts!inner(number, name_en)"
          )
          .eq("election_year", year)
          .limit(5000);
        if (error) throw error;
        if (cancelled) return;

        const mapped: Row[] = (data ?? []).map((r: any) => ({
          id: r.id,
          candidate_id: r.candidate_id,
          candidate_name: r.candidates?.full_name ?? "—",
          candidate_slug: r.candidates?.slug ?? "",
          party_name: r.candidates?.parties?.name_en ?? null,
          party_id: r.candidates?.party_id ?? null,
          district_id: r.district_id,
          district_number: r.districts?.number ?? 0,
          district_name: r.districts?.name_en ?? "",
          election_year: r.election_year,
          elected: !!r.elected,
          initial_elected: !!r.elected,
          elected_via_gcm: !!r.elected_via_gcm,
          initial_elected_via_gcm: !!r.elected_via_gcm,
          elected_via_proportionality: !!r.elected_via_proportionality,
          initial_elected_via_proportionality: !!r.elected_via_proportionality,
          votes: r.votes_first_count == null ? "" : String(r.votes_first_count),
          initial_votes: r.votes_first_count == null ? "" : String(r.votes_first_count),
        }));
        mapped.sort(
          (a, b) =>
            a.district_number - b.district_number ||
            a.candidate_name.localeCompare(b.candidate_name),
        );
        setRows(mapped);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    void (async () => {
      const [d, p] = await Promise.all([
        supabase.from("districts").select("id, number, name_en").order("number"),
        supabase.from("parties").select("id, name_en").order("name_en"),
      ]);
      setDistricts((d.data ?? []) as DistrictOpt[]);
      setParties(((p.data ?? []) as { id: string; name_en: string }[]).map((x) => ({ id: x.id, name: x.name_en })));
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (districtFilter !== "all" && r.district_id !== districtFilter) return false;
      if (partyFilter !== "all" && r.party_id !== partyFilter) return false;
      if (electedFilter === "elected" && !r.elected) return false;
      if (electedFilter === "not" && r.elected) return false;
      if (electedFilter === "gcm" && !r.elected_via_gcm) return false;
      if (electedFilter === "prop" && !r.elected_via_proportionality) return false;
      if (
        modifiedOnly &&
        r.elected === r.initial_elected &&
        r.elected_via_gcm === r.initial_elected_via_gcm &&
        r.elected_via_proportionality === r.initial_elected_via_proportionality &&
        r.votes === r.initial_votes
      )
        return false;
      if (q && !r.candidate_name.toLowerCase().includes(q) && !r.candidate_slug.includes(q))
        return false;
      return true;
    });
  }, [rows, districtFilter, partyFilter, electedFilter, modifiedOnly, search]);

  const dirtyCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.elected !== r.initial_elected ||
          r.elected_via_gcm !== r.initial_elected_via_gcm ||
          r.elected_via_proportionality !== r.initial_elected_via_proportionality ||
          r.votes !== r.initial_votes,
      ).length,
    [rows],
  );

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const allSelected = filtered.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const bulkSetElected = (value: boolean) => {
    if (selected.size === 0) {
      toast.info("Select rows first");
      return;
    }
    setRows((prev) =>
      prev.map((r) => (selected.has(r.id) ? { ...r, elected: value } : r)),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const changed = rows.filter(
        (r) =>
          r.elected !== r.initial_elected ||
          r.elected_via_gcm !== r.initial_elected_via_gcm ||
          r.votes !== r.initial_votes,
      );
      if (changed.length === 0) {
        toast.info("No changes to save");
        return;
      }
      // Run in chunks to avoid overly long payloads.
      const chunkSize = 100;
      for (let i = 0; i < changed.length; i += chunkSize) {
        const chunk = changed.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((r) =>
            supabase
              .from("candidate_districts")
              .update({
                elected: r.elected,
                elected_via_gcm: r.elected_via_gcm,
                votes_first_count: r.votes === "" ? null : Number(r.votes),
              })
              .eq("id", r.id),
          ),
        );
      }
      toast.success(`Saved ${changed.length} row${changed.length === 1 ? "" : "s"}`);
      setRows((prev) =>
        prev.map((r) =>
          changed.find((c) => c.id === r.id)
            ? {
                ...r,
                initial_elected: r.elected,
                initial_elected_via_gcm: r.elected_via_gcm,
                initial_votes: r.votes,
              }
            : r,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header =
      "candidate_slug,candidate_name,district_number,district_name,party,elected,elected_via_gcm,votes_first_count";
    const lines = filtered.map((r) =>
      [
        r.candidate_slug,
        csvCell(r.candidate_name),
        r.district_number,
        csvCell(r.district_name),
        csvCell(r.party_name ?? ""),
        r.elected ? "true" : "false",
        r.elected_via_gcm ? "true" : "false",
        r.votes,
      ].join(","),
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elected-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error("CSV has no rows");
        return;
      }
      const required = ["candidate_slug", "district_number", "elected"];
      const missing = required.filter((k) => !parsed[0] || !(k in parsed[0]));
      if (missing.length > 0) {
        toast.error(`CSV missing columns: ${missing.join(", ")}`);
        return;
      }
      let matched = 0;
      let unmatched = 0;
      setRows((prev) => {
        const next = prev.map((r) => ({ ...r }));
        const bySlugDistrict = new Map<string, Row>();
        next.forEach((r) =>
          bySlugDistrict.set(`${r.candidate_slug}|${r.district_number}`, r),
        );
        for (const p of parsed) {
          const key = `${p.candidate_slug?.trim()}|${Number(p.district_number)}`;
          const row = bySlugDistrict.get(key);
          if (!row) {
            unmatched += 1;
            continue;
          }
          row.elected = /^(1|true|yes|y|t)$/i.test((p.elected ?? "").trim());
          if ("elected_via_gcm" in p) {
            row.elected_via_gcm = /^(1|true|yes|y|t)$/i.test(
              (p.elected_via_gcm ?? "").trim(),
            );
          }
          if ("votes_first_count" in p) {
            const v = (p.votes_first_count ?? "").trim();
            row.votes = v;
          }
          matched += 1;
        }
        return next;
      });
      toast.success(
        `CSV applied: ${matched} matched${unmatched ? `, ${unmatched} unmatched` : ""}. Review then Save.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-foreground">Elected — bulk editor</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quickly mark which candidates were elected per district. Edit inline, paste in
          results from a CSV, or download the current view to share.
        </p>
      </header>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          Year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          District
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="all">All</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number} — {d.name_en}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          Party
          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="all">All</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          Status
          <select
            value={electedFilter}
            onChange={(e) => setElectedFilter(e.target.value as "all" | "elected" | "not" | "gcm")}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="all">All</option>
            <option value="elected">Elected only</option>
            <option value="not">Not elected</option>
            <option value="gcm">GCM only</option>
          </select>
        </label>

        <label className="flex flex-1 flex-col text-xs font-semibold text-muted-foreground">
          Search name
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Candidate name or slug"
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={modifiedOnly}
            onChange={(e) => setModifiedOnly(e.target.checked)}
          />
          Modified only
        </label>
      </div>

      {/* Action bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => bulkSetElected(true)}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
        >
          <Star className="h-3.5 w-3.5" /> Mark elected ({selected.size})
        </button>
        <button
          onClick={() => bulkSetElected(false)}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40"
        >
          Clear elected ({selected.size})
        </button>

        <span className="mx-2 h-5 w-px bg-border" />

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <Upload className="h-3.5 w-3.5" /> Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {dirtyCount > 0 ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {dirtyCount} unsaved
              </span>
            ) : (
              "No changes"
            )}
          </span>
          <button
            onClick={save}
            disabled={saving || dirtyCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </button>
        </div>
      </div>

      {/* CSV format hint */}
      <details className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">CSV format</summary>
        <div className="mt-2 space-y-1">
          <p>Header row required. Columns:</p>
          <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`candidate_slug,district_number,elected,votes_first_count
john-borg,5,true,3120
maria-vella,9,false,`}
          </pre>
          <p>
            <code>elected</code>: <code>true/false</code>, <code>1/0</code>, or <code>yes/no</code>.
            <code className="ml-1">votes_first_count</code> is optional. Unmatched rows (no contesting link for that
            candidate × district in the selected year) are skipped — create them first from the candidate editor.
          </p>
        </div>
      </details>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No rows for this year/filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-10 px-2 py-2">
                  <button
                    onClick={toggleSelectAllFiltered}
                    aria-label="Select all filtered"
                    className="flex items-center"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2">District</th>
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Party</th>
                <th className="px-2 py-2 text-center">Elected</th>
                <th className="px-2 py-2 text-center">GCM</th>
                <th className="px-2 py-2">Votes (1st)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const dirty =
                  r.elected !== r.initial_elected ||
                  r.elected_via_gcm !== r.initial_elected_via_gcm ||
                  r.votes !== r.initial_votes;
                return (
                  <tr
                    key={r.id}
                    className={
                      "border-b border-border/60 " +
                      (dirty ? "bg-amber-50/60 dark:bg-amber-500/5 " : "") +
                      (r.elected ? "" : "")
                    }
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">
                      {r.district_number}
                      <span className="ml-1 text-muted-foreground">{r.district_name}</span>
                    </td>
                    <td className="px-2 py-1.5 font-medium text-foreground">
                      {r.candidate_name}
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.candidate_slug}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.party_name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <label className="inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={r.elected}
                          onChange={(e) => updateRow(r.id, { elected: e.target.checked })}
                          className="h-4 w-4 accent-emerald-600"
                        />
                      </label>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <label className="inline-flex cursor-pointer items-center" title="Elected via Gender Corrective Mechanism">
                        <input
                          type="checkbox"
                          checked={r.elected_via_gcm}
                          onChange={(e) =>
                            updateRow(r.id, {
                              elected_via_gcm: e.target.checked,
                              // If we mark GCM, also ensure elected=true (a GCM seat is still an elected seat).
                              elected: e.target.checked ? true : r.elected,
                            })
                          }
                          className="h-4 w-4 accent-fuchsia-600"
                        />
                      </label>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={r.votes}
                        onChange={(e) => updateRow(r.id, { votes: e.target.value })}
                        className="w-24 rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} rows.
      </p>
    </div>
  );
}

// --- CSV helpers -----------------------------------------------------------

function csvCell(v: string) {
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        field = "";
        if (cur.some((c) => c !== "")) rows.push(cur);
        cur = [];
      } else {
        field += ch;
      }
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    if (cur.some((c) => c !== "")) rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, idx) => {
      o[h] = r[idx] ?? "";
    });
    return o;
  });
}
