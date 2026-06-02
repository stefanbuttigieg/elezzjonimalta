import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ExternalLink } from "lucide-react";
import {
  getElcomCandidateCounts,
  refreshElcomCandidateCounts,
  ELCOM_YEARS,
  ELCOM_COUNT_RANGES,
  type ElcomCandidateCounts,
} from "@/lib/elcomCandidateCounts.functions";
import { useAuth } from "@/lib/auth";


const DISTRICT_NUMBERS = Array.from({ length: 13 }, (_, i) => i + 1);

function fmt(n: number | null): string {
  if (n == null) return "…";
  return n.toLocaleString("en-MT");
}
function fmtDiff(n: number | null): string | null {
  if (n == null || n === 0) return null;
  return n > 0 ? `+${n.toLocaleString("en-MT")}` : n.toLocaleString("en-MT");
}

export function ElcomCandidateCountsPanel() {
  const fetchCounts = useServerFn(getElcomCandidateCounts);
  const refreshCounts = useServerFn(refreshElcomCandidateCounts);
  const { isAdmin } = useAuth();
  const [year, setYear] = useState<number>(2026);
  const [districtNumber, setDistrictNumber] = useState<number>(1);
  const [countRange, setCountRange] = useState<number>(0);
  const [data, setData] = useState<ElcomCandidateCounts | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = (opts?: { force?: boolean }) => {
    const id = ++reqId.current;
    setLoading(true);
    setErr(null);
    fetchCounts({ data: { year, districtNumber, countRange, force: opts?.force } })
      .then((res) => {
        if (id !== reqId.current) return;
        setData(res);
        if (!res.ok && res.error) setErr(res.error);
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, districtNumber, countRange]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErr(null);
    try {
      const res = await refreshCounts({ data: { year, districtNumber, countRange } });
      setData(res);
      if (!res.ok && res.error) setErr(res.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };


  const rowsByParty = useMemo(() => {
    type Row = ElcomCandidateCounts["rows"][number];
    if (!data) return [] as Array<{ party: string; rows: Row[] }>;
    const map = new Map<string, Row[]>();
    for (const r of data.rows) {
      const k = r.party || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).map(([party, rows]) => ({ party, rows }));
  }, [data]);

  const colCount = data?.countLabels.length ?? 5;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground sm:text-xl">
            Riżultati skont id-distrett — Kummissjoni Elettorali
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Voti għal kull kandidat fil-għodd 1–25, miġbura mill-paġna uffiċjali tal-Kummissjoni Elettorali.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              title="Iġġib data ġdida mill-Kummissjoni Elettorali"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Qed niġġedded…" : "Iġġedded"}
            </button>
          ) : null}
          <a
            href="https://electoral.gov.mt/ElectionResults/General"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            electoral.gov.mt <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sena</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {ELCOM_YEARS.map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distrett</span>
          <select
            value={districtNumber}
            onChange={(e) => setDistrictNumber(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {DISTRICT_NUMBERS.map((n) => (
              <option key={n} value={n}>
                Distrett {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Għodd</span>
          <select
            value={countRange}
            onChange={(e) => setCountRange(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {ELCOM_COUNT_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                Għodd {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data?.summary.title ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-foreground">{data.summary.title}</span>
          {data.summary.seats != null ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {data.summary.seats} siġġijiet
            </span>
          ) : null}
          {data.summary.quota != null ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              Kwota {fmt(data.summary.quota)}
            </span>
          ) : null}
          {data.summary.validVotes != null ? (
            <span className="text-xs text-muted-foreground">
              Voti validi {fmt(data.summary.validVotes)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Qed nieħu d-data…
          </div>
        ) : err && (!data || !data.ok) ? (
          <div className="p-6 text-sm text-destructive">
            Ma stajniex naqraw id-data: {err}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            M'hemmx data għad-distrett magħżul.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Kandidat</th>
                {data.countLabels.map((lbl, i) => (
                  <th key={`${lbl}-${i}`} className="px-3 py-2 text-right font-semibold">
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rowsByParty.map(({ party, rows }) => (
                <FragmentGroup key={party} party={party} rows={rows} colCount={colCount} />
              ))}
              {data.nonTransferrable.length > 0 ? (
                <tr className="bg-muted/30">
                  <td className="px-3 py-2 font-semibold text-foreground">Voti mhux trasferibbli</td>
                  {data.nonTransferrable.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-foreground">
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ) : null}
              {data.totals.length > 0 ? (
                <tr className="bg-muted/60">
                  <td className="px-3 py-2 font-bold text-foreground">Totali</td>
                  {data.totals.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right font-bold tabular-nums text-foreground">
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {data?.generatedAt ? (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Aġġornat {new Date(data.generatedAt).toLocaleString("en-MT")}
        </p>
      ) : null}
    </section>
  );
}

function FragmentGroup({
  party,
  rows,
  colCount,
}: {
  party: string;
  rows: ElcomCandidateCounts["rows"];
  colCount: number;
}) {
  return (
    <>
      <tr className="bg-accent/40">
        <td colSpan={colCount + 1} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-foreground">
          {party || "—"}
        </td>
      </tr>
      {rows.map((r, idx) => (
        <tr key={`${party}-${r.name}-${idx}`} className="hover:bg-muted/30">
          <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
          {r.counts.map((c, i) => {
            const diff = i > 0 ? r.diffs[i - 1] : null;
            const diffStr = fmtDiff(diff);
            return (
              <td key={i} className="px-3 py-2 text-right tabular-nums text-foreground">
                <div>{fmt(c)}</div>
                {diffStr ? (
                  <div
                    className={
                      "text-[11px] " + (diff! > 0 ? "text-emerald-600" : "text-destructive")
                    }
                  >
                    {diffStr}
                  </div>
                ) : null}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
