// Server-only helpers for writing to the admin_audit_log table.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AuditEntry {
  entityType: string;
  entityId?: string | null;
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(
  client: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await client.from("admin_audit_log").insert({
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      note: entry.note ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      metadata: (entry.metadata ?? {}) as never,
    });
    if (error) console.error("audit log insert failed", error);
  } catch (err) {
    console.error("audit log threw", err);
  }
}
