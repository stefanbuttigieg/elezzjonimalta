// Authenticated server functions for the Community Proposals Import workflow.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Decision } from "./communityImport.server";
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

const StartInput = z.object({
  authorId: z.string().uuid(),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
  uploadedFilePath: z.string().trim().max(500).nullable().optional(),
  sourceKind: z.enum(["pdf", "html", "upload"]),
  language: z.enum(["en", "mt", "both"]).default("en"),
});

export const startCommunityImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      if (!data.sourceUrl && !data.uploadedFilePath) {
        return { ok: false as const, error: "Provide either a URL or upload a file" };
      }

      const { data: author, error: aErr } = await supabaseAdmin
        .from("community_authors")
        .select("id, name")
        .eq("id", data.authorId)
        .maybeSingle();
      if (aErr || !author) return { ok: false as const, error: "Author not found" };

      const { data: row, error } = await supabaseAdmin
        .from("community_imports" as never)
        .insert({
          author_id: data.authorId,
          source_url: data.sourceUrl ?? null,
          source_kind: data.sourceKind,
          file_path: data.uploadedFilePath ?? null,
          language: data.language,
          status: "processing",
          stage: "Queued…",
          progress: 0,
          imported_by: userId,
        } as never)
        .select("id")
        .single();
      if (error || !row) {
        return { ok: false as const, error: error?.message ?? "Could not create import" };
      }
      const importId = (row as { id: string }).id;

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "community_import",
        entityId: importId,
        action: "start",
        actorId: userId,
        actorEmail: email,
        metadata: {
          author_id: data.authorId,
          source_kind: data.sourceKind,
          source_url: data.sourceUrl ?? null,
        },
      });

      // Pipeline is driven from the client via tickCommunityImport.

      return { ok: true as const, importId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("startCommunityImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

const StatusInput = z.object({ importId: z.string().uuid() });

export const getCommunityImportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const { data: row, error } = await supabaseAdmin
        .from("community_imports" as never)
        .select("*")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: error?.message ?? "Not found" };
      return { ok: true as const, row };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const tickCommunityImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const result = await runCommunityImportStep(data.importId);
      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("tickCommunityImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

export const retryCommunityImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      const { data: row, error } = await supabaseAdmin
        .from("community_imports" as never)
        .select("id, author_id, source_url, source_kind, file_path, language, status")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const r = row as {
        id: string;
        author_id: string;
        source_url: string | null;
        source_kind: "pdf" | "html" | "upload";
        file_path: string | null;
        language: "en" | "mt" | "both";
        status: string;
      };
      if (r.status === "processing") {
        return { ok: false as const, error: "Import is already running" };
      }

      await resetCommunityImport(r.id);

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "community_import",
        entityId: r.id,
        action: "retry",
        actorId: userId,
        actorEmail: email,
        metadata: { source_kind: r.source_kind, source_url: r.source_url },
      });

      return { ok: true as const, importId: r.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("retryCommunityImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

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

export const applyCommunityImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      const { supabase, userId, claims } = context;
      await assertStaff(supabase as never);

      const { data: row, error } = await supabaseAdmin
        .from("community_imports" as never)
        .select("id, author_id, source_url, status")
        .eq("id", data.importId)
        .maybeSingle();
      if (error || !row) return { ok: false as const, error: "Import not found" };
      const importRow = row as { id: string; author_id: string; source_url: string | null; status: string };
      if (importRow.status !== "ready") {
        return { ok: false as const, error: `Import is ${importRow.status}; cannot apply` };
      }

      const result = await applyCommunityDecisions({
        importId: importRow.id,
        authorId: importRow.author_id,
        sourceUrl: importRow.source_url,
        decisions: data.decisions as Decision[],
      });

      await supabaseAdmin
        .from("community_imports" as never)
        .update({
          status: "applied",
          summary: result as never,
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", importRow.id);

      const email = (claims as { email?: string }).email ?? null;
      await writeAudit(supabaseAdmin, {
        entityType: "community_import",
        entityId: importRow.id,
        action: "apply",
        actorId: userId,
        actorEmail: email,
        metadata: { ...result } as Record<string, unknown>,
      });

      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("applyCommunityImport failed:", message);
      return { ok: false as const, error: message };
    }
  });

const UploadUrlInput = z.object({
  authorId: z.string().uuid(),
  filename: z.string().trim().min(1).max(200),
});

export const createCommunityUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UploadUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { applyCommunityDecisions, resetCommunityImport, runCommunityImportStep } = await import("./communityImport.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { writeAudit } = await import("./auditLog.server");
      await assertStaff(context.supabase as never);
      const safe = data.filename.replace(/[^a-z0-9.\-_]+/gi, "-").slice(0, 120);
      const path = `community/${data.authorId}/${Date.now()}-${safe}`;
      const { data: signed, error } = await supabaseAdmin.storage
        .from("manifestos")
        .createSignedUploadUrl(path);
      if (error || !signed) return { ok: false as const, error: error?.message ?? "Could not sign upload" };
      return { ok: true as const, path, token: signed.token, signedUrl: signed.signedUrl };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
