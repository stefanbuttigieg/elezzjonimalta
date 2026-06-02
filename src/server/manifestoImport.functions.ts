// Authenticated server functions for the Manifesto Import workflow.
//
// Architecture: tick-driven pipeline. The client repeatedly calls
// `tickManifestoImport` until it returns done=true. Each tick advances the
// state machine by ONE step inside Worker time/CPU limits. There is no
// fire-and-forget background work — that pattern doesn't survive on
// Cloudflare Workers and was the root cause of imports stalling at 0%.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyManifestoDecisions,
  resetManifestoImport,
  runManifestoImportStep,
  type Decision,
} from "./manifestoImport.server";

async function assertStaff(supabase: {
  rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
}) {
  const { data, error } = await supabase.rpc("get_my_roles");
  if (error) throw new Error("could not verify role");
  const roles = (Array.isArray(data) ? data : []) as string[];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden: staff role required");
  }
  return roles;
}

// ---------------------------------------------------------------------------
// 1. Start an import — only inserts the row. The client immediately polls
//    `tickManifestoImport` to drive the pipeline forward.
// ---------------------------------------------------------------------------

const StartInput = z.object({
  partyId: z.string().uuid(),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
  uploadedFilePath: z.string().trim().max(500).nullable().optional(),
  sourceKind: z.enum(["pdf", "html", "upload"]),
  language: z.enum(["en", "mt", "both"]).default("en"),
});

export const startManifestoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      if (!data.sourceUrl && !data.uploadedFilePath) {
        return { ok: false as const, error: "Provide either a URL or upload a file" };
      }

      const { data: party, error: pErr } = await supabaseAdmin
        .from("parties")
        .select("id, name_en")
        .eq("id", data.partyId)
        .maybeSingle();
      if (pErr || !party) return { ok: false as const, error: "Party not found" };

      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .insert({
          party_id: data.partyId,
          source_url: data.sourceUrl ?? null,
          source_kind: data.sourceKind,
          file_path: data.uploadedFilePath ?? null,
          language: data.language,
          status: "processing",
          stage: "Queued…",
          progress: 0,
          imported_by: userId,
          summary: { pipeline: { phase: "queued" } } as never,
        } as never)
        .select("id")
        .single();
      if (error || !row) {
        return { ok: false as const, error: error?.message ?? "Could not create import" };
      }
      const importId = (row as { id: string }).id;

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "manifesto_import",
        entityId: importId,
        action: "start",
        actorId: userId,
        actorEmail: email,
        metadata: { party_id: data.partyId, source_kind: data.sourceKind, source_url: data.sourceUrl ?? null },
      });

      return { ok: true as const, importId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("startManifestoImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 2. Tick — advance the pipeline by one step. Client polls until done.
// ---------------------------------------------------------------------------

const TickInput = z.object({ importId: z.string().uuid() });

export const tickManifestoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TickInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const result = await runManifestoImportStep(data.importId);
      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("tickManifestoImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 3. Poll for status + extracted rows
// ---------------------------------------------------------------------------

const StatusInput = z.object({ importId: z.string().uuid() });

export const getManifestoImportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select("*")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: error?.message ?? "Not found" };
      return { ok: true as const, row };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

export const retryManifestoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select("id, status, source_kind, source_url")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const r = row as { id: string; status: string; source_kind: string; source_url: string | null };
      if (r.status === "processing") {
        // Still processing — caller can just keep ticking.
        return { ok: true as const, importId: r.id };
      }

      await resetManifestoImport(r.id);

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "manifesto_import",
        entityId: r.id,
        action: "retry",
        actorId: userId,
        actorEmail: email,
        metadata: { source_kind: r.source_kind, source_url: r.source_url },
      });

      return { ok: true as const, importId: r.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("retryManifestoImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 4. Apply decisions — bulk create/update/skip in one call
// ---------------------------------------------------------------------------

const DecisionSchema = z.object({
  extractedIndex: z.number().int().nonnegative(),
  action: z.enum(["create", "update", "skip"]),
  targetId: z.string().uuid().nullable().optional(),
  fields: z.object({
    title_en: z.string().min(1).max(500),
    title_mt: z.string().max(500).nullable().optional(),
    description_en: z.string().max(5000).nullable().optional(),
    description_mt: z.string().max(5000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    page_number: z.number().int().nullable().optional(),
  }),
});

const ApplyInput = z.object({
  importId: z.string().uuid(),
  decisions: z.array(DecisionSchema).min(1).max(500),
});

export const applyManifestoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select("id, party_id, source_url, status")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const importRow = row as { id: string; party_id: string; source_url: string | null; status: string };
      if (importRow.status !== "ready") {
        return { ok: false as const, error: `Import is ${importRow.status}; cannot apply` };
      }

      const result = await applyManifestoDecisions({
        importId: importRow.id,
        partyId: importRow.party_id,
        sourceUrl: importRow.source_url,
        decisions: data.decisions as Decision[],
        actorId: userId,
      });

      await supabaseAdmin
        .from("manifesto_imports" as never)
        .update({
          status: "applied",
          summary: result as never,
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", importRow.id);

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "manifesto_import",
        entityId: importRow.id,
        action: "apply",
        actorId: userId,
        actorEmail: email,
        metadata: { ...result } as Record<string, unknown>,
      });

      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("applyManifestoImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 5. Signed upload URL for direct PDF upload to the `manifestos` bucket.
// ---------------------------------------------------------------------------

const UploadUrlInput = z.object({
  partyId: z.string().uuid(),
  filename: z.string().trim().min(1).max(200),
});

// ---------------------------------------------------------------------------
// 6. Signed download URL for the archived PDF (review-step preview pane).
// ---------------------------------------------------------------------------

const PdfUrlInput = z.object({ importId: z.string().uuid() });

export const getManifestoPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PdfUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select("file_path, source_kind")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const r = row as { file_path: string | null; source_kind: string };
      if (!r.file_path) {
        return { ok: false as const, error: "No archived PDF for this import" };
      }
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from("manifestos")
        .createSignedUrl(r.file_path, 60 * 60);
      if (sErr || !signed) {
        return { ok: false as const, error: sErr?.message ?? "Could not sign URL" };
      }
      return { ok: true as const, signedUrl: signed.signedUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

export const createManifestoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UploadUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const safe = data.filename.replace(/[^a-z0-9.\-_]+/gi, "-").slice(0, 120);
      const path = `${data.partyId}/${Date.now()}-${safe}`;
      const { data: signed, error } = await supabaseAdmin.storage
        .from("manifestos")
        .createSignedUploadUrl(path);
      if (error || !signed) return { ok: false as const, error: error?.message ?? "Could not sign upload" };
      return { ok: true as const, path, token: signed.token, signedUrl: signed.signedUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 7. Cancel a running import.
// ---------------------------------------------------------------------------

const CancelInput = z.object({ importId: z.string().uuid() });

export const cancelManifestoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      const { data: row, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select("id, status")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const r = row as { id: string; status: string };
      if (r.status !== "processing" && r.status !== "ready") {
        return { ok: false as const, error: `Import is ${r.status}; cannot cancel` };
      }

      await supabaseAdmin
        .from("manifesto_imports" as never)
        .update({
          status: "cancelled",
          stage: "Cancelled",
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", r.id);

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "manifesto_import",
        entityId: r.id,
        action: "cancel",
        actorId: userId,
        actorEmail: email,
        metadata: { previous_status: r.status },
      });

      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("cancelManifestoImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

// ---------------------------------------------------------------------------
// 8. List recent manifesto imports
// ---------------------------------------------------------------------------

const ListInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export const listManifestoImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const { data: rows, error } = await supabaseAdmin
        .from("manifesto_imports" as never)
        .select(
          "id, party_id, source_url, source_kind, file_path, language, status, stage, progress, error, page_count, created_at, updated_at, finished_at, summary, party:parties(id, name_en, short_name)",
        )
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, rows: rows ?? [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });
