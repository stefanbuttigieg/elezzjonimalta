// Server-only AI Assistant indexer.
// Pulls rows from configured sources, chunks them into citation-ready text,
// and upserts into knowledge_chunks. Retrieval uses Postgres full-text search
// (the Lovable AI gateway no longer exposes an embeddings endpoint).
// Skips re-writing rows whose content_hash is unchanged.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ALL_SOURCE_KEYS = [
  "candidates",
  "parties",
  "proposals",
  "voting_faqs",
  "districts",
  "news_findings",
] as const;
export type SourceKey = (typeof ALL_SOURCE_KEYS)[number];

interface BuiltChunk {
  source_key: SourceKey;
  entity_type: string;
  entity_id: string | null;
  external_ref: string | null;
  title: string;
  content: string;
  url: string | null;
  metadata: Record<string, unknown>;
}

export interface ReindexOptions {
  sourceKeys?: SourceKey[];
  triggeredBy?: string | null;
  trigger?: "manual" | "cron";
}

export interface ReindexResult {
  runId: string;
  chunksTotal: number;
  chunksInserted: number;
  chunksUpdated: number;
  chunksUnchanged: number;
  chunksDeleted: number;
  perSource: Record<string, { built: number; error?: string }>;
  error?: string;
}

function hash(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function trim(s: string | null | undefined, max = 1500): string {
  if (!s) return "";
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed;
}

// ---------- Builders per source ----------

async function buildCandidates(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select(
      "id, slug, full_name, bio_en, bio_mt, profession, languages, is_incumbent, electoral_confirmed, not_contesting_2026, leadership_role, party:parties(name_en, short_name), district:districts!candidates_primary_district_id_fkey(number, name_en)"
    )
    .or("status.eq.published,is_incumbent.eq.true")
    .limit(maxItems);
  if (error) throw new Error(`candidates: ${error.message}`);
  return (data ?? []).map((c) => {
    const party = (c.party as { name_en?: string; short_name?: string | null } | null)?.name_en ?? "Independent";
    const district = c.district as { number?: number; name_en?: string } | null;
    const districtStr = district ? `District ${district.number} (${district.name_en})` : "";
    const flags = [
      c.is_incumbent ? "sitting MP" : null,
      c.electoral_confirmed ? "confirmed 2026 candidate" : null,
      c.not_contesting_2026 ? "not contesting 2026" : null,
      c.leadership_role,
    ]
      .filter(Boolean)
      .join(", ");
    const bio = trim(c.bio_en || c.bio_mt, 1200);
    const content = `Candidate: ${c.full_name}. Party: ${party}. ${districtStr}${flags ? ". " + flags : ""}.${
      c.profession ? " Profession: " + c.profession + "." : ""
    }${bio ? "\n\n" + bio : ""}`;
    return {
      source_key: "candidates" as const,
      entity_type: "candidate",
      entity_id: c.id,
      external_ref: c.slug,
      title: c.full_name,
      content,
      url: `/candidates/${c.slug}`,
      metadata: { party, district: district?.number ?? null, is_incumbent: c.is_incumbent },
    };
  });
}

async function buildParties(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("parties")
    .select("id, slug, name_en, short_name, leader_name, founded_year, slogan_en, slogan_mt, description_en, description_mt")
    .eq("status", "published")
    .limit(maxItems);
  if (error) throw new Error(`parties: ${error.message}`);
  return (data ?? []).map((p) => {
    const desc = trim(p.description_en || p.description_mt, 1500);
    const content = `Party: ${p.name_en}${p.short_name ? ` (${p.short_name})` : ""}.${
      p.leader_name ? " Leader: " + p.leader_name + "." : ""
    }${p.founded_year ? " Founded: " + p.founded_year + "." : ""}${
      p.slogan_en || p.slogan_mt ? ' Slogan: "' + (p.slogan_en || p.slogan_mt) + '".' : ""
    }${desc ? "\n\n" + desc : ""}`;
    return {
      source_key: "parties" as const,
      entity_type: "party",
      entity_id: p.id,
      external_ref: p.slug,
      title: p.name_en,
      content,
      url: `/parties/${p.slug}`,
      metadata: { short_name: p.short_name },
    };
  });
}

async function buildProposals(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select(
      "id, title_en, title_mt, description_en, description_mt, category, party:parties(name_en, slug), candidate:candidates(full_name, slug)"
    )
    .eq("status", "published")
    .is("merged_into_id", null)
    .limit(maxItems);
  if (error) throw new Error(`proposals: ${error.message}`);
  return (data ?? []).map((p) => {
    const party = p.party as { name_en?: string; slug?: string } | null;
    const cand = p.candidate as { full_name?: string; slug?: string } | null;
    const owner = party?.name_en ?? cand?.full_name ?? "Unknown";
    const title = p.title_en || p.title_mt || "(untitled)";
    const desc = trim(p.description_en || p.description_mt, 1500);
    const content = `Proposal by ${owner}: ${title}.${p.category ? " Category: " + p.category + "." : ""}${
      desc ? "\n\n" + desc : ""
    }`;
    return {
      source_key: "proposals" as const,
      entity_type: "proposal",
      entity_id: p.id,
      external_ref: null,
      title,
      content,
      url: party?.slug ? `/parties/${party.slug}` : cand?.slug ? `/candidates/${cand.slug}` : "/proposals",
      metadata: { owner, category: p.category ?? null },
    };
  });
}

async function buildVotingFaqs(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("voting_faqs")
    .select("id, question_en, question_mt, answer_en, answer_mt, source_url, source_label")
    .eq("status", "published")
    .limit(maxItems);
  if (error) throw new Error(`voting_faqs: ${error.message}`);
  return (data ?? []).map((f) => {
    const q = f.question_en || f.question_mt || "";
    const a = trim(f.answer_en || f.answer_mt, 1800);
    const content = `Voting FAQ — Q: ${q}\nA: ${a}\nSource: ${f.source_label ?? "unknown"}`;
    return {
      source_key: "voting_faqs" as const,
      entity_type: "voting_faq",
      entity_id: f.id,
      external_ref: null,
      title: q,
      content,
      url: f.source_url || "/faq",
      metadata: { source: f.source_label },
    };
  });
}

async function buildDistricts(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("districts")
    .select("id, number, name_en, name_mt, localities_en, localities_mt")
    .eq("status", "published")
    .limit(maxItems);
  if (error) throw new Error(`districts: ${error.message}`);
  return (data ?? []).map((d) => {
    const content = `Electoral District ${d.number}: ${d.name_en}${
      d.name_mt ? " (" + d.name_mt + ")" : ""
    }. Localities: ${trim(d.localities_en || d.localities_mt, 1200) || "(unspecified)"}.`;
    return {
      source_key: "districts" as const,
      entity_type: "district",
      entity_id: d.id,
      external_ref: String(d.number),
      title: `District ${d.number} — ${d.name_en}`,
      content,
      url: `/districts`,
      metadata: { number: d.number },
    };
  });
}

async function buildNewsFindings(maxItems: number): Promise<BuiltChunk[]> {
  const { data, error } = await supabaseAdmin
    .from("news_findings")
    .select(
      "id, kind, title, summary_en, summary_mt, extracted, status, source:news_sources(name), article:news_articles(url, published_at)"
    )
    .eq("status", "reviewed")
    .order("created_at", { ascending: false })
    .limit(maxItems);
  if (error) throw new Error(`news_findings: ${error.message}`);
  return (data ?? []).map((n) => {
    const summary = trim(n.summary_en || n.summary_mt, 1500);
    const src = (n.source as { name?: string } | null)?.name ?? "news source";
    const art = n.article as { url?: string; published_at?: string | null } | null;
    const content = `News (${n.kind}, ${src}): ${n.title ?? "(no title)"}.${summary ? "\n\n" + summary : ""}`;
    return {
      source_key: "news_findings" as const,
      entity_type: "news_finding",
      entity_id: n.id,
      external_ref: null,
      title: n.title ?? "News finding",
      content,
      url: art?.url ?? null,
      metadata: { kind: n.kind, published_at: art?.published_at ?? null, source: src },
    };
  });
}

async function buildForSource(key: SourceKey, maxItems: number): Promise<BuiltChunk[]> {
  switch (key) {
    case "candidates": return buildCandidates(maxItems);
    case "parties": return buildParties(maxItems);
    case "proposals": return buildProposals(maxItems);
    case "voting_faqs": return buildVotingFaqs(maxItems);
    case "districts": return buildDistricts(maxItems);
    case "news_findings": return buildNewsFindings(maxItems);
  }
}

// ---------- Reindex orchestrator ----------

export async function runReindex(opts: ReindexOptions = {}): Promise<ReindexResult> {
  let sourcesQuery = supabaseAdmin.from("assistant_sources").select("*").eq("enabled", true);
  if (opts.sourceKeys && opts.sourceKeys.length > 0) {
    sourcesQuery = sourcesQuery.in("key", opts.sourceKeys);
  }
  const { data: sources, error: sourcesErr } = await sourcesQuery;
  if (sourcesErr) throw new Error(`load sources: ${sourcesErr.message}`);

  const { data: run, error: runErr } = await supabaseAdmin
    .from("assistant_reindex_runs")
    .insert({
      trigger: opts.trigger ?? "manual",
      source_keys: (sources ?? []).map((s) => s.key),
      triggered_by: opts.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(`create run: ${runErr?.message}`);
  const runId = run.id;

  const perSource: ReindexResult["perSource"] = {};
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  let total = 0;
  const overallErrors: string[] = [];

  for (const src of sources ?? []) {
    const key = src.key as SourceKey;
    try {
      const built = await buildForSource(key, src.max_items ?? 500);
      perSource[key] = { built: built.length };

      // Compute hashes and figure out which rows to embed
      const withHash = built.map((b) => ({ ...b, content_hash: hash(b.content) }));

      // Existing chunks for this source
      const { data: existing, error: existErr } = await supabaseAdmin
        .from("knowledge_chunks")
        .select("id, entity_id, external_ref, content_hash")
        .eq("source_key", key);
      if (existErr) throw new Error(existErr.message);

      const existingMap = new Map<string, { id: string; content_hash: string }>();
      for (const e of existing ?? []) {
        const k = `${e.entity_id ?? "_"}::${e.external_ref ?? "_"}`;
        existingMap.set(k, { id: e.id, content_hash: e.content_hash });
      }

      // Decide which need (re)embedding
      const toEmbed: typeof withHash = [];
      const fresh = new Set<string>();
      for (const b of withHash) {
        const k = `${b.entity_id ?? "_"}::${b.external_ref ?? "_"}`;
        fresh.add(k);
        const prior = existingMap.get(k);
        if (!prior || prior.content_hash !== b.content_hash) {
          toEmbed.push(b);
        } else {
          unchanged += 1;
        }
      }

      // Embed in batches of 50
      const BATCH = 50;
      const embeddings: number[][] = [];
      for (let i = 0; i < toEmbed.length; i += BATCH) {
        const batch = toEmbed.slice(i, i + BATCH);
        const vecs = await embedTexts(batch.map((b) => b.content), embeddingModel);
        embeddings.push(...vecs);
      }

      // Upsert
      for (let i = 0; i < toEmbed.length; i += 1) {
        const b = toEmbed[i];
        const vec = toPgVector(embeddings[i]);
        const k = `${b.entity_id ?? "_"}::${b.external_ref ?? "_"}`;
        const prior = existingMap.get(k);
        if (prior) {
          const { error } = await supabaseAdmin
            .from("knowledge_chunks")
            .update({
              title: b.title,
              content: b.content,
              url: b.url,
              metadata: b.metadata as never,
              embedding: vec as unknown as never,
              content_hash: b.content_hash,
            })
            .eq("id", prior.id);
          if (error) throw new Error(error.message);
          updated += 1;
        } else {
          const { error } = await supabaseAdmin.from("knowledge_chunks").insert({
            source_key: b.source_key,
            entity_type: b.entity_type,
            entity_id: b.entity_id,
            external_ref: b.external_ref,
            title: b.title,
            content: b.content,
            url: b.url,
            metadata: b.metadata as never,
            embedding: vec as unknown as never,
            content_hash: b.content_hash,
          });
          if (error) throw new Error(error.message);
          inserted += 1;
        }
      }

      // Delete stale rows that were no longer built
      const stale: string[] = [];
      for (const [k, v] of existingMap.entries()) {
        if (!fresh.has(k)) stale.push(v.id);
      }
      if (stale.length > 0) {
        const { error } = await supabaseAdmin.from("knowledge_chunks").delete().in("id", stale);
        if (error) throw new Error(error.message);
        deleted += stale.length;
      }

      total += built.length;

      await supabaseAdmin
        .from("assistant_sources")
        .update({
          last_indexed_at: new Date().toISOString(),
          last_chunk_count: built.length,
          last_error: null,
        })
        .eq("id", src.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      overallErrors.push(`${key}: ${msg}`);
      perSource[key] = { built: 0, error: msg };
      await supabaseAdmin
        .from("assistant_sources")
        .update({ last_error: msg.slice(0, 1000) })
        .eq("id", src.id);
    }
  }

  await supabaseAdmin
    .from("assistant_reindex_runs")
    .update({
      finished_at: new Date().toISOString(),
      chunks_total: total,
      chunks_inserted: inserted,
      chunks_updated: updated,
      chunks_unchanged: unchanged,
      chunks_deleted: deleted,
      error: overallErrors.length ? overallErrors.join(" | ").slice(0, 2000) : null,
    })
    .eq("id", runId);

  return {
    runId,
    chunksTotal: total,
    chunksInserted: inserted,
    chunksUpdated: updated,
    chunksUnchanged: unchanged,
    chunksDeleted: deleted,
    perSource,
    error: overallErrors.length ? overallErrors.join(" | ") : undefined,
  };
}
