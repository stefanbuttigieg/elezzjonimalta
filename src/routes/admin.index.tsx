import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Landmark, Map as MapIcon, Users } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface Counts {
  candidates: { total: number; pending: number; published: number };
  parties: { total: number; published: number };
  districts: { total: number; published: number };
}

function AdminDashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [
          cAll,
          cPending,
          cPub,
          pAll,
          pPub,
          dAll,
          dPub,
        ] = await Promise.all([
          supabase.from("candidates").select("*", { count: "exact", head: true }),
          supabase
            .from("candidates")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending_review"),
          supabase
            .from("candidates")
            .select("*", { count: "exact", head: true })
            .eq("status", "published"),
          supabase.from("parties").select("*", { count: "exact", head: true }),
          supabase
            .from("parties")
            .select("*", { count: "exact", head: true })
            .eq("status", "published"),
          supabase.from("districts").select("*", { count: "exact", head: true }),
          supabase
            .from("districts")
            .select("*", { count: "exact", head: true })
            .eq("status", "published"),
        ]);
        if (cancelled) return;
        setCounts({
          candidates: {
            total: cAll.count ?? 0,
            pending: cPending.count ?? 0,
            published: cPub.count ?? 0,
          },
          parties: { total: pAll.count ?? 0, published: pPub.count ?? 0 },
          districts: { total: dAll.count ?? 0, published: dPub.count ?? 0 },
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">Admin dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review imported candidates and manage published records before they appear on the public site.
        </p>
      </header>

      {error ? (
        <p className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          to="/admin/review"
          icon={ClipboardList}
          label="Pending review"
          value={counts?.candidates.pending ?? "—"}
          accent
        />
        <Card
          to="/admin/candidates"
          icon={Users}
          label="Candidates"
          value={counts?.candidates.total ?? "—"}
          sub={`${counts?.candidates.published ?? 0} published`}
        />
        <Card
          to="/admin/parties"
          icon={Landmark}
          label="Parties"
          value={counts?.parties.total ?? "—"}
          sub={`${counts?.parties.published ?? 0} published`}
        />
        <Card
          to="/admin/districts"
          icon={MapIcon}
          label="Districts"
          value={counts?.districts.total ?? "—"}
          sub={`${counts?.districts.published ?? 0} published`}
        />
      </div>

      <section className="mt-12 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="font-serif text-xl font-semibold text-foreground">Workflow</h2>
        <ol className="mt-4 space-y-3 text-sm text-foreground/80">
          <li>
            <span className="font-semibold text-foreground">1. Review.</span> Imported candidates land in
            "Pending review". Edit details, then approve or archive.
          </li>
          <li>
            <span className="font-semibold text-foreground">2. Curate.</span> Manage parties and districts
            so candidates can be linked properly.
          </li>
          <li>
            <span className="font-semibold text-foreground">3. Publish.</span> Only records with status{" "}
            <span className="font-semibold">Published</span> appear on the public site.
          </li>
        </ol>
      </section>
    </div>
  );
}

function Card({
  to,
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        "flex flex-col rounded-xl border p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated " +
        (accent
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-surface")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="mt-3 font-serif text-3xl font-bold text-foreground">{value}</span>
      {sub ? <span className="mt-1 text-xs text-muted-foreground">{sub}</span> : null}
    </Link>
  );
}
