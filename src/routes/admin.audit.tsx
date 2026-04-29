import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/audit")({
  component: AuditLogPage,
});

interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  note: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ENTITY_OPTIONS = ["", "news_finding", "news_scan_run", "candidate", "party", "district", "proposal"];

function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (entity) q = q.eq("entity_type", entity);
    if (action) q = q.eq("action", action);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [entity, action]);

  const toggle = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">
            <History className="mr-2 inline h-7 w-7 text-muted-foreground" />
            Audit log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All approvals, dismissals, re-processing, and admin actions.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <div className="mt-6 flex flex-wrap gap-3">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
          {ENTITY_OPTIONS.map((o) => <option key={o} value={o}>{o || "All entities"}</option>)}
        </select>
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action (e.g. detected, dismiss, reprocess_requested)"
          className="min-w-[260px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No entries.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(r.created_at))} ago
                </td>
                <td className="px-3 py-2 text-xs"><span className="font-medium text-foreground">{r.entity_type}</span><br /><span className="text-muted-foreground">{r.entity_id?.slice(0, 8) ?? "—"}</span></td>
                <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{r.action}</span></td>
                <td className="px-3 py-2 text-xs">{r.actor_email ?? r.actor_id?.slice(0, 8) ?? "system"}</td>
                <td className="px-3 py-2">
                  <button onClick={() => toggle(r.id)} className="text-xs text-primary hover:underline">
                    {expanded.has(r.id) ? "Hide" : "Show"}
                  </button>
                  {expanded.has(r.id) ? (
                    <pre className="mt-2 max-w-2xl overflow-auto rounded bg-muted p-2 text-[11px]">
{JSON.stringify({ note: r.note, before: r.before, after: r.after, metadata: r.metadata }, null, 2)}
                    </pre>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
