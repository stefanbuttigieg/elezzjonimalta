import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Activity } from "lucide-react";

export const Route = createFileRoute("/admin/api-logs")({
  component: ApiLogsPage,
});

interface LogRow {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  query_string: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  response_time_ms: number | null;
  created_at: string;
}

const ENDPOINT_FILTERS = [
  { value: "", label: "All endpoints" },
  { value: "/api/public/v1/candidates", label: "Candidates" },
  { value: "/api/public/v1/parties", label: "Parties" },
  { value: "/api/public/v1/districts", label: "Districts" },
];

function ApiLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointFilter, setEndpointFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("api_request_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (endpointFilter) query = query.eq("endpoint", endpointFilter);
    if (statusFilter === "success") query = query.lt("status_code", 400);
    if (statusFilter === "error") query = query.gte("status_code", 400);

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setLogs((data ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status_code < 400).length;
    const errors = logs.filter((l) => l.status_code >= 400).length;
    const avgMs =
      logs.length > 0
        ? Math.round(
            logs.reduce((s, l) => s + (l.response_time_ms ?? 0), 0) / logs.length
          )
        : 0;
    const last24 = logs.filter(
      (l) => Date.now() - new Date(l.created_at).getTime() < 86_400_000
    ).length;
    return { total, success, errors, avgMs, last24 };
  }, [logs]);

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">API request logs</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Public API endpoint activity. IP addresses are hashed for privacy. Showing the
            most recent 500 entries.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Refresh
        </button>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Shown" value={stats.total} />
        <Stat label="Last 24h" value={stats.last24} />
        <Stat label="2xx/3xx" value={stats.success} accent="success" />
        <Stat label="4xx/5xx" value={stats.errors} accent="error" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Average response time across shown logs: {stats.avgMs} ms
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={endpointFilter}
          onChange={(e) => setEndpointFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {ENDPOINT_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="success">Success only</option>
          <option value="error">Errors only</option>
        </select>
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
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Endpoint</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Query</th>
                <th className="px-4 py-3 font-semibold">IP (hashed)</th>
                <th className="px-4 py-3 font-semibold">User-Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Activity className="mx-auto mb-2 h-6 w-6" />
                    No requests recorded yet for the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/30">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">
                        {log.method}
                      </span>
                      {log.endpoint.replace("/api/public/v1/", "")}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge code={log.status_code} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {log.response_time_ms != null ? `${log.response_time_ms} ms` : "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {log.query_string || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {log.ip_hash ? log.ip_hash.slice(0, 8) : "—"}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                      {log.user_agent || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "error";
}) {
  const color =
    accent === "success"
      ? "text-emerald-600"
      : accent === "error"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={"mt-1 font-serif text-2xl font-bold " + color}>{value}</div>
    </div>
  );
}

function StatusBadge({ code }: { code: number }) {
  const tone =
    code < 300
      ? "bg-emerald-500/10 text-emerald-700"
      : code < 400
        ? "bg-blue-500/10 text-blue-700"
        : code === 429
          ? "bg-amber-500/15 text-amber-700"
          : "bg-destructive/10 text-destructive";
  return (
    <span
      className={
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums " +
        tone
      }
    >
      {code}
    </span>
  );
}
