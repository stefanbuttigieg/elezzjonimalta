import { supabase } from "@/integrations/supabase/client";

export type ReviewStatus = "draft" | "pending_review" | "published" | "archived";

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  archived: "Archived",
};

export const STATUS_COLOR: Record<ReviewStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  published: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  archived: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + STATUS_COLOR[status]
      }
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Candidate-specific status badge.
 *
 * The plain `status` column is misleading for candidates because:
 *  - Sitting MPs are publicly visible regardless of `status` (RLS rule on `is_incumbent`).
 *  - `status = 'published'` only means "running in 2026" when `electoral_confirmed` is also true
 *    (electoral_confirmed is set by the sitting-MPs publish flow).
 *
 * This badge collapses those signals into something an admin can read at a glance.
 */
export function CandidateStatusBadge({
  status,
  isIncumbent,
  electoralConfirmed,
}: {
  status: ReviewStatus;
  isIncumbent: boolean;
  electoralConfirmed: boolean;
}) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ";

  if (status === "published" && electoralConfirmed) {
    return (
      <span
        className={base + "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"}
        title="Published as a 2026 candidate"
      >
        Published · 2026
      </span>
    );
  }

  if (isIncumbent && status === "published" && !electoralConfirmed) {
    return (
      <span
        className={base + "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"}
        title="Visible publicly as a sitting MP, but not yet confirmed as a 2026 candidate"
      >
        Sitting MP · not yet 2026
      </span>
    );
  }

  if (isIncumbent) {
    return (
      <span
        className={base + "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"}
        title={`Visible publicly as a sitting MP (review status: ${STATUS_LABEL[status]})`}
      >
        Sitting MP · {STATUS_LABEL[status].toLowerCase()}
      </span>
    );
  }

  return <StatusBadge status={status} />;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export async function updateStatus(
  table: "parties" | "districts" | "candidates" | "proposals",
  id: string,
  status: ReviewStatus
) {
  const { error } = await supabase.from(table).update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteRow(
  table: "parties" | "districts" | "candidates" | "proposals",
  id: string
) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
