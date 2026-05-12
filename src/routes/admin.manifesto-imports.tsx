// Admin: list of recent manifesto import jobs with live progress.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listManifestoImports } from "@/server/manifestoImport.functions";
import { CheckCircle2, AlertTriangle, Loader2, FileText, ExternalLink, RefreshCw } from "lucide-react";

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

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
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
              rows.map((r) => <ImportRow key={r.id} row={r} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportRow({ row }: { row: Row }) {
  const partyLabel = row.party?.short_name || row.party?.name_en || "—";
  const sourceLabel = row.source_url
    ? safeHostname(row.source_url)
    : row.source_kind === "upload"
      ? "Uploaded PDF"
      : row.source_kind.toUpperCase();
  const summary = row.summary && typeof row.summary === "object"
    ? (row.summary as { created?: number; updated?: number; skipped?: number; errors?: unknown[] })
    : null;

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
        <Link
          to="/admin/proposals"
          search={{ import: row.id }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          {row.status === "ready" ? "Review" : row.status === "processing" ? "Open" : "Reopen"}
        </Link>
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
