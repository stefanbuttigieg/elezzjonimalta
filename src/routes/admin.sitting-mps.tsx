import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CandidateStatusBadge, type ReviewStatus } from "@/lib/admin";
import { CheckCircle2, Search, Rocket, XCircle, Users, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sitting-mps")({
  component: SittingMpsAdmin,
});

interface Row {
  id: string;
  full_name: string;
  slug: string;
  status: ReviewStatus;
  electoral_confirmed: boolean;
  party: { name_en: string; short_name: string | null } | null;
  district: { number: number; name_en: string } | null;
}

function SittingMpsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "not_running">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, full_name, slug, status, electoral_confirmed, party:parties(name_en, short_name), district:districts(number, name_en)"
      )
      .eq("is_incumbent", true)
      .order("full_name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === "running" && !(r.electoral_confirmed && r.status === "published")) return false;
        if (filter === "not_running" && r.electoral_confirmed && r.status === "published") return false;
        if (!q) return true;
        const needle = q.toLowerCase();
        return (
          r.full_name.toLowerCase().includes(needle) ||
          (r.party?.name_en?.toLowerCase().includes(needle) ?? false) ||
          (r.district?.name_en?.toLowerCase().includes(needle) ?? false)
        );
      }),
    [rows, q, filter]
  );

  const counts = useMemo(() => {
    const running = rows.filter((r) => r.electoral_confirmed && r.status === "published").length;
    return { total: rows.length, running, remaining: rows.length - running };
  }, [rows]);

  const publishOne = async (id: string, name: string) => {
    setBusy(id);
    const { error } = await supabase
      .from("candidates")
      .update({ electoral_confirmed: true, status: "published" })
      .eq("id", id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${name} published as a 2026 candidate`);
    void load();
  };

  const unpublishOne = async (id: string, name: string) => {
    if (!confirm(`Mark ${name} as NOT running in 2026? They will be hidden from candidate lists.`)) return;
    setBusy(id);
    const { error } = await supabase
      .from("candidates")
      .update({ electoral_confirmed: false, status: "archived" })
      .eq("id", id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${name} marked as not running`);
    void load();
  };

  const bulkPublish = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("candidates")
      .update({ electoral_confirmed: true, status: "published" })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Published ${ids.length} sitting MP${ids.length === 1 ? "" : "s"} as 2026 candidates`);
    void load();
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filtered.map((r) => r.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Sitting MPs · 2026 candidates</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Confirm which sitting Members of Parliament are running again in 2026 and publish them as
            candidates in one click. Publishing sets <em>electoral_confirmed</em> and status to{" "}
            <em>published</em> so they appear on the public party and candidate pages.
          </p>
        </div>
        <Link
          to="/admin/candidates"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent"
        >
          <Users className="h-3.5 w-3.5" /> All candidates
        </Link>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Sitting MPs" value={counts.total} />
        <Stat label="Confirmed running 2026" value={counts.running} accent />
        <Stat label="Awaiting confirmation" value={counts.remaining} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, party or district…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All sitting MPs</option>
          <option value="running">Confirmed running 2026</option>
          <option value="not_running">Not yet confirmed</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <button
            onClick={() => void bulkPublish()}
            disabled={selected.size === 0 || bulkBusy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
            {bulkBusy ? "Publishing…" : "Publish selected as 2026 candidates"}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={
                    filtered.length > 0 && filtered.every((r) => selected.has(r.id))
                  }
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="px-4 py-3">MP</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">District</th>
              <th className="px-4 py-3">2026 status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading sitting MPs…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No sitting MPs match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isRunning = r.electoral_confirmed && r.status === "published";
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.full_name}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.full_name}</div>
                      <Link
                        to="/admin/candidates"
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Open in editor
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.party?.short_name ?? r.party?.name_en ?? "Independent"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.district ? `${r.district.number} · ${r.district.name_en}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CandidateStatusBadge
                          status={r.status}
                          isIncumbent={true}
                          electoralConfirmed={r.electoral_confirmed}
                        />
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                            <CheckCircle2 className="h-3 w-3" /> Running 2026
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isRunning ? (
                        <button
                          onClick={() => void unpublishOne(r.id, r.full_name)}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" /> Mark not running
                        </button>
                      ) : (
                        <button
                          onClick={() => void publishOne(r.id, r.full_name)}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Rocket className="h-3 w-3" />
                          {busy === r.id ? "Publishing…" : "Publish as candidate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-xl border p-4 shadow-card " +
        (accent ? "border-primary/30 bg-primary/5" : "border-border bg-surface")
      }
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}
