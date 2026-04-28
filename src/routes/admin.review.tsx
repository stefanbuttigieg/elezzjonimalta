import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateStatus, type ReviewStatus } from "@/lib/admin";
import { CheckCircle2, Archive, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/review")({
  component: ReviewQueue,
});

interface Row {
  id: string;
  full_name: string;
  status: ReviewStatus;
  imported_from: string | null;
  source_url: string | null;
  bio_en: string | null;
  party: { name_en: string } | null;
  district: { number: number; name_en: string } | null;
  created_at: string;
}

function ReviewQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, full_name, status, imported_from, source_url, bio_en, created_at, party:parties(name_en), district:districts(number, name_en)"
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (id: string, status: ReviewStatus, msg: string) => {
    try {
      await updateStatus("candidates", id, status);
      toast.success(msg);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <div>
      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">Pending review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported candidates waiting for editorial approval before they appear publicly.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-medium text-foreground">All clear.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No candidates are awaiting review.
            </p>
          </div>
        ) : (
          rows.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-border bg-surface p-5 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-bold text-foreground">{r.full_name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.party?.name_en ?? "Independent"} ·{" "}
                    {r.district ? `District ${r.district.number} (${r.district.name_en})` : "No district"}
                    {r.imported_from ? ` · Imported from ${r.imported_from}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/admin/candidates"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                  >
                    Open in editor
                  </Link>
                  <button
                    onClick={() => void act(r.id, "published", "Approved & published")}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve & publish
                  </button>
                  <button
                    onClick={() => void act(r.id, "archived", "Archived")}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                  >
                    <Archive className="h-3 w-3" /> Archive
                  </button>
                </div>
              </div>
              {r.bio_en ? (
                <p className="mt-3 line-clamp-3 text-sm text-foreground/80">{r.bio_en}</p>
              ) : (
                <p className="mt-3 text-sm italic text-muted-foreground">No bio yet.</p>
              )}
              {r.source_url ? (
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Source
                </a>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
