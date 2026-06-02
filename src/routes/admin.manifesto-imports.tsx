// Admin: list of recent manifesto import jobs with live progress.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cancelManifestoImport, listManifestoImports } from "@/server-fns/manifestoImport.functions";
import { CheckCircle2, AlertTriangle, Loader2, FileText, ExternalLink, RefreshCw, X } from "lucide-react";

export const Route = createFileRoute("/admin/manifesto-imports")({
  component: ManifestoImportsAdmin,
});

type Row = {
  id: string;
  party_id: string;
  source_url: string | null;
  source_kind: string;
  language: string;
  status: "processing" | "ready" | "applied" | "failed" | "cancelled";
  stage: string | null;
  progress: number | null;
  error: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  summary: Record<string, unknown> | null;
  party: { id: string; name_en: string; short_name: string | null } | null;
};

function ManifestoImportsAdmin() {
  const listFn = useServerFn(listManifestoImports);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await listFn({ data: { limit: 100 } });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
        } else {
          setRows(res.rows as Row[]);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Re-poll faster while any job is processing.
          const hasActive = rows.some((r) => r.status === "processing");
          timer = setTimeout(tick, hasActive ? 3000 : 15000);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFn]);

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Manifesto imports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Background jobs created by the manifesto importer. Auto-refreshes every few seconds while a job is running.
          </p>
        </div>
        <Link
          to="/admin/proposals"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-accent"
        >
          <FileText className="h-4 w-4" />
          Start new import
        </Link>
      </header>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ActivePanel rows={rows} />

      <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        All imports
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-accent/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-[28%]">Progress</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Finished</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No manifesto imports yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => <ImportRow key={r.id} row={r} onChanged={() => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "cancelled", stage: "Cancelled" } : x))} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const cancelFn = useServerFn(cancelManifestoImport);
  const [cancelling, setCancelling] = useState(false);
  const partyLabel = row.party?.short_name || row.party?.name_en || "—";
  const sourceLabel = row.source_url
    ? safeHostname(row.source_url)
    : row.source_kind === "upload"
      ? "Uploaded PDF"
      : row.source_kind.toUpperCase();
  const summary = row.summary && typeof row.summary === "object"
    ? (row.summary as { created?: number; updated?: number; skipped?: number; errors?: unknown[] })
    : null;

  const canCancel = row.status === "processing" || row.status === "ready";
  const handleCancel = async () => {
    if (!confirm("Cancel this import? Any extracted rows will be discarded.")) return;
    setCancelling(true);
    try {
      const res = await cancelFn({ data: { importId: row.id } });
      if (!res.ok) alert(res.error);
      else onChanged();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 font-semibold text-foreground">{partyLabel}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {row.source_url ? (
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {sourceLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          sourceLabel
        )}
        <div className="mt-0.5 text-[11px] uppercase tracking-wider">{row.language} · {row.source_kind}</div>
      </td>
      <td className="px-4 py-3">
        <StatusPill status={row.status} />
        {row.status === "failed" && row.error ? (
          <p className="mt-1 max-w-xs text-xs text-destructive line-clamp-2">{row.error}</p>
        ) : null}
        {row.status === "applied" && summary ? (
          <p className="mt-1 text-xs text-muted-foreground">
            +{summary.created ?? 0} created · {summary.updated ?? 0} updated · {summary.skipped ?? 0} skipped
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                "h-full rounded-full transition-[width] duration-500 ease-out " +
                (row.status === "failed"
                  ? "bg-destructive"
                  : row.status === "applied" || row.status === "ready"
                    ? "bg-emerald-500"
                    : "bg-primary")
              }
              style={{ width: `${row.progress ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span className="truncate">{row.stage ?? "—"}</span>
            <span>{row.progress ?? 0}%</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.created_at)}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
        {row.finished_at ? formatDateTime(row.finished_at) : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          {canCancel ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Cancel
            </button>
          ) : null}
          <Link
            to="/admin/proposals"
            search={{ import: row.id }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            {row.status === "ready" ? "Review" : row.status === "processing" ? "Open" : "Reopen"}
          </Link>
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  const map: Record<Row["status"], { label: string; tone: string; icon: typeof CheckCircle2 }> = {
    processing: { label: "Processing", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/20", icon: Loader2 },
    ready: { label: "Ready to review", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20", icon: RefreshCw },
    applied: { label: "Applied", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20", icon: CheckCircle2 },
    failed: { label: "Failed", tone: "bg-destructive/10 text-destructive ring-destructive/20", icon: AlertTriangle },
    cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground ring-border", icon: AlertTriangle },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${m.tone}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function ActivePanel({ rows }: { rows: Row[] }) {
  const active = rows.filter((r) => r.status === "processing" || r.status === "ready");
  const recentFailed = rows
    .filter((r) => r.status === "failed")
    .slice(0, 3);

  if (active.length === 0 && recentFailed.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      {active.length > 0 ? (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active imports ({active.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((r) => (
              <ActiveCard key={r.id} row={r} />
            ))}
          </div>
        </div>
      ) : null}
      {recentFailed.length > 0 ? (
        <div>
          <h2 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent failures
          </h2>
          <div className="space-y-2">
            {recentFailed.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-foreground">
                    {r.party?.short_name || r.party?.name_en || "—"}
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Stopped at: <span className="font-medium text-foreground">{r.stage ?? "—"}</span>
                  {" · "}
                  {r.progress ?? 0}%
                </div>
                {r.error ? (
                  <p className="mt-1.5 text-xs text-destructive whitespace-pre-wrap break-words">
                    {r.error}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActiveCard({ row }: { row: Row }) {
  const partyLabel = row.party?.short_name || row.party?.name_en || "—";
  const pct = row.progress ?? 0;
  const elapsedMs = Date.now() - new Date(row.updated_at).getTime();
  const stalled = elapsedMs > 60_000; // no progress for 1+ min
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-bold text-foreground truncate">
              {partyLabel}
            </span>
            <StatusPill status={row.status} />
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {row.language} · {row.source_kind}
          </div>
        </div>
        <Link
          to="/admin/proposals"
          search={{ import: row.id }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          {row.status === "ready" ? "Review" : "Open"}
        </Link>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-foreground truncate">{row.stage ?? "Queued"}</span>
          <span className="tabular-nums font-semibold text-foreground">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={
              "h-full rounded-full transition-[width] duration-500 ease-out " +
              (row.status === "ready" ? "bg-emerald-500" : "bg-primary")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>Updated {formatRelative(elapsedMs)} ago</span>
          {stalled ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              No progress — cron will retry
            </span>
          ) : null}
        </div>
      </div>

      {row.error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive whitespace-pre-wrap break-words">
          <span className="font-semibold">Last error: </span>
          {row.error}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

