import { supabase } from "@/integrations/supabase/client";

export interface ProposalRowForMerge {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  source_url: string | null;
  notes?: string | null;
  party_id: string | null;
  candidate_id: string | null;
  status: string;
}

interface MergeOptions {
  primary: ProposalRowForMerge;
  duplicates: ProposalRowForMerge[];
  note: string;
}

/**
 * Merge `duplicates` into `primary`:
 *  - Append duplicate source_urls + merge note to primary's notes
 *  - Append duplicate descriptions if primary's description is empty
 *  - Mark each duplicate as archived with merged_into_id, merged_at, merge_note
 *  - Write an audit log entry per duplicate
 */
export async function mergeProposals({ primary, duplicates, note }: MergeOptions): Promise<void> {
  if (duplicates.length === 0) return;

  const { data: userRes } = await supabase.auth.getUser();
  const actor = userRes?.user;

  // Build appended notes
  const timestamp = new Date().toISOString().slice(0, 10);
  const sourceLines = duplicates
    .map((d) => {
      const parts = [`• ${d.title_en}`];
      if (d.source_url) parts.push(`(${d.source_url})`);
      return parts.join(" ");
    })
    .filter(Boolean);

  const mergeBlock = [
    `--- Merged on ${timestamp} ---`,
    note ? note : "",
    "Absorbed proposals:",
    ...sourceLines,
  ]
    .filter(Boolean)
    .join("\n");

  const newNotes = [primary.notes ?? "", mergeBlock].filter(Boolean).join("\n\n");

  // If primary has no description, take from first duplicate that has one
  let newDescEn = primary.description_en;
  let newDescMt = primary.description_mt;
  if (!newDescEn) {
    const found = duplicates.find((d) => d.description_en);
    if (found) newDescEn = found.description_en;
  }
  if (!newDescMt) {
    const found = duplicates.find((d) => d.description_mt);
    if (found) newDescMt = found.description_mt;
  }

  const primaryUpdate: Record<string, unknown> = { notes: newNotes };
  if (newDescEn !== primary.description_en) primaryUpdate.description_en = newDescEn;
  if (newDescMt !== primary.description_mt) primaryUpdate.description_mt = newDescMt;

  const { error: primaryErr } = await supabase
    .from("proposals")
    .update(primaryUpdate as never)
    .eq("id", primary.id);
  if (primaryErr) throw primaryErr;

  const mergedAt = new Date().toISOString();

  // Archive each duplicate
  for (const dup of duplicates) {
    const { error: dupErr } = await supabase
      .from("proposals")
      .update({
        status: "archived",
        merged_into_id: primary.id,
        merged_at: mergedAt,
        merge_note: note || null,
      } as never)
      .eq("id", dup.id);
    if (dupErr) throw dupErr;

    // Best-effort audit log entry
    await supabase.from("admin_audit_log").insert({
      action: "merge_proposal",
      entity_type: "proposal",
      entity_id: dup.id,
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      note: note || null,
      metadata: {
        merged_into_id: primary.id,
        merged_into_title: primary.title_en,
        duplicate_title: dup.title_en,
        duplicate_source_url: dup.source_url,
      },
      before: {
        status: dup.status,
        source_url: dup.source_url,
      },
      after: {
        status: "archived",
        merged_into_id: primary.id,
      },
    } as never);
  }
}
