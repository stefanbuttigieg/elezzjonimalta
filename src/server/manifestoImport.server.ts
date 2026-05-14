// Server-only manifesto ingestion pipeline — TICK-BASED state machine.
//
// Why a state machine instead of one long background job?
// On Cloudflare Workers (the runtime TanStack Start ships to) there is no
// reliable way to keep an unawaited promise alive past the HTTP response,
// and a single multi-minute job blows past the Worker's CPU/wall-clock cap
// anyway. So we split the pipeline into small steps, persist state to the
// `manifesto_imports` row between steps, and let the admin UI drive the
// pipeline forward by polling a `tickManifestoImport` server fn.
//
// Phases (stored in `summary.pipeline.phase`):
//   queued      → row just created, no work done yet.
//   loading     → download/scrape source, extract pages, build chunks.
//   extracting  → per tick, process ONE chunk through Gemini and append.
//   matching    → dedupe + pg_trgm fuzzy match against existing proposals.
//   done        → row.status = 'ready', summary.pipeline cleared.
//
// Each tick has a soft wall-clock budget of ~18s and only does ONE unit of
// work, so it always finishes well inside Worker limits. If the Worker is
// killed mid-tick, the next tick simply re-runs that one step (idempotent).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tagProposalsBatch } from "@/server/proposalGeoTag.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const MAX_PROPOSALS_PER_IMPORT = 500;
const MAX_PAGES = 200;
const MAX_CHARS_PER_CHUNK = 28_000;
const SIMILARITY_THRESHOLD_AUTO_UPDATE = 0.78;

// How many chunks to process per `extracting` tick. Each chunk is one Gemini
// call (~10–25s); keep this at 1 so a single tick never approaches the
// Worker's timeout, even on a slow upstream.
const CHUNKS_PER_TICK = 1;

const SYSTEM_PROMPT = `You are a strictly neutral, non-partisan extraction agent for Maltese political party manifestos.

Your job: read a chunk of manifesto text and extract every concrete policy PROPOSAL or COMMITMENT made by the party. Ignore preamble, vision statements, biographies, photo captions, and rhetorical flourishes.

A "proposal" is something the party promises to DO, BUILD, FUND, REFORM, INTRODUCE, ABOLISH, or CHANGE. If a sentence is purely descriptive ("Malta has 14 hospitals") with no commitment, skip it.

For every proposal, return a JSON object with:
- title_en: short noun phrase summarising the promise, in English (≤ 12 words). Translate from Maltese if the source is Maltese.
- title_mt: same in Maltese, only if you can derive it confidently from the text. Otherwise omit.
- description_en: 1–3 sentences expanding the proposal in English.
- description_mt: same in Maltese only if confident; otherwise omit.
- category: short topic tag (e.g. "health", "education", "transport", "economy", "environment", "justice", "housing", "social"). Lowercase, single word where possible.
- page_number: integer page where you found it, if the chunk header includes "[Page N]" markers. Otherwise omit.
- verbatim_quote: a SHORT (≤ 200 chars) snippet copied exactly from the manifesto that proves the proposal exists. Required.

Return ONLY valid JSON, no markdown fences, with this exact shape:
{ "proposals": [ { "title_en": "...", "description_en": "...", "category": "...", "verbatim_quote": "...", "title_mt": "...", "description_mt": "...", "page_number": 12 } ] }

If the chunk contains no proposals, return { "proposals": [] }.`;

interface ExtractedProposal {
  title_en: string;
  title_mt?: string;
  description_en: string;
  description_mt?: string;
  category?: string;
  page_number?: number;
  verbatim_quote: string;
}

interface MatchSuggestion {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  status: string;
  score: number;
}

export interface ReviewRow extends ExtractedProposal {
  matches: MatchSuggestion[];
  suggested_action: "create" | "update" | "skip";
  suggested_target_id: string | null;
}

interface PageText {
  page: number | null;
  text: string;
}

interface Chunk {
  text: string;
  firstPage: number | null;
}

type Phase = "queued" | "loading" | "extracting" | "matching" | "done";

interface PipelineState {
  phase: Phase;
  chunks?: Chunk[];
  nextChunkIndex?: number;
  extracted?: ExtractedProposal[];
}

export interface TickResult {
  status: "processing" | "ready" | "failed" | "cancelled";
  stage: string;
  progress: number;
  done: boolean;
}

interface ImportRow {
  id: string;
  party_id: string;
  source_url: string | null;
  source_kind: "pdf" | "html" | "upload";
  file_path: string | null;
  language: "en" | "mt" | "both";
  status: "processing" | "ready" | "applied" | "failed" | "cancelled";
  stage: string | null;
  progress: number | null;
  logs: { at: string; pct: number; stage: string }[] | null;
  summary: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Public entry — advance the pipeline by ONE step. Caller polls this until
// the returned `done` flag is true.
// ---------------------------------------------------------------------------

export async function runManifestoImportStep(importId: string): Promise<TickResult> {
  const row = await loadRow(importId);
  if (!row) throw new Error("Import row not found");

  // Terminal states: do nothing.
  if (row.status === "ready" || row.status === "applied" || row.status === "failed" || row.status === "cancelled") {
    return {
      status: row.status === "applied" ? "ready" : row.status,
      stage: row.stage ?? row.status,
      progress: row.progress ?? 100,
      done: true,
    };
  }

  const summary = (row.summary ?? {}) as Record<string, unknown>;
  const pipeline = ((summary.pipeline as PipelineState | undefined) ?? { phase: "queued" }) as PipelineState;
  const logs = Array.isArray(row.logs) ? [...row.logs] : [];

  try {
    switch (pipeline.phase) {
      case "queued":
        return await stepStartLoading(row, summary, logs);
      case "loading":
        return await stepLoading(row, summary, logs);
      case "extracting":
        return await stepExtracting(row, summary, pipeline, logs);
      case "matching":
        return await stepMatching(row, summary, pipeline, logs);
      case "done":
        return { status: "ready", stage: row.stage ?? "Ready", progress: 100, done: true };
    }
  } catch (err) {
    return await failRow(importId, err, logs);
  }
}

// Reset the row back to queued so the next tick re-runs from scratch.
// Used by the retry server fn — keeps the row id so the UI link still works.
export async function resetManifestoImport(importId: string): Promise<void> {
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      status: "processing",
      stage: "Queued…",
      progress: 0,
      error: null,
      error_stack: null,
      logs: [] as never,
      extracted: [] as never,
      summary: { pipeline: { phase: "queued" } } as never,
      finished_at: null,
    } as never)
    .eq("id", importId);
}

// ---------------------------------------------------------------------------
// Phase: queued → loading
// Just flip the phase + write a starting log line. Cheap; client immediately
// re-ticks into the actual loading work.
// ---------------------------------------------------------------------------

async function stepStartLoading(
  row: ImportRow,
  summary: Record<string, unknown>,
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  logs.push({ at: new Date().toISOString(), pct: 5, stage: "Fetching source…" });
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      stage: "Fetching source…",
      progress: 5,
      logs: logs as never,
      summary: { ...summary, pipeline: { phase: "loading" } } as never,
    } as never)
    .eq("id", row.id);
  return { status: "processing", stage: "Fetching source…", progress: 5, done: false };
}

// ---------------------------------------------------------------------------
// Phase: loading
// Download / scrape the source, extract pages, build chunks. Persist the
// chunk array on the row so subsequent ticks don't redo this work.
// ---------------------------------------------------------------------------

async function stepLoading(
  row: ImportRow,
  summary: Record<string, unknown>,
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  const { pages, archivedPath, pageCount } = await loadSource({
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    filePath: row.file_path,
    partyId: row.party_id,
  });

  const chunks = chunkPages(pages);
  const stage = `Extracting proposals from ${pageCount} pages (0/${chunks.length} chunks)…`;
  logs.push({ at: new Date().toISOString(), pct: 18, stage });

  const newPipeline: PipelineState = {
    phase: "extracting",
    chunks,
    nextChunkIndex: 0,
    extracted: [],
  };

  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      stage,
      progress: 18,
      page_count: pageCount,
      file_path: archivedPath ?? row.file_path ?? null,
      logs: logs as never,
      summary: { ...summary, pipeline: newPipeline } as never,
    } as never)
    .eq("id", row.id);

  return { status: "processing", stage, progress: 18, done: false };
}

// ---------------------------------------------------------------------------
// Phase: extracting
// Per tick, run AI on `CHUNKS_PER_TICK` chunks, append results, advance the
// index. When all chunks are done, flip phase to 'matching'.
// ---------------------------------------------------------------------------

async function stepExtracting(
  row: ImportRow,
  summary: Record<string, unknown>,
  pipeline: PipelineState,
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  const chunks = pipeline.chunks ?? [];
  const extracted = pipeline.extracted ? [...pipeline.extracted] : [];
  let nextIndex = pipeline.nextChunkIndex ?? 0;
  const totalChunks = Math.max(chunks.length, 1);

  // No chunks at all → straight to matching.
  if (chunks.length === 0) {
    return await flipToMatching(row, summary, extracted, logs);
  }

  const end = Math.min(nextIndex + CHUNKS_PER_TICK, chunks.length);
  for (let i = nextIndex; i < end; i++) {
    const items = await extractChunk(chunks[i], row.language);
    extracted.push(...items);
    if (extracted.length >= MAX_PROPOSALS_PER_IMPORT) {
      nextIndex = chunks.length; // stop early
      break;
    }
  }
  if (nextIndex < chunks.length) nextIndex = end;

  const isDone = nextIndex >= chunks.length || extracted.length >= MAX_PROPOSALS_PER_IMPORT;
  const pct = Math.round(20 + (70 * Math.min(nextIndex, chunks.length)) / totalChunks);
  const stage = `Extracting proposals… (${Math.min(nextIndex, chunks.length)}/${chunks.length} chunks, ${extracted.length} so far)`;
  logs.push({ at: new Date().toISOString(), pct, stage });

  if (isDone) {
    return await flipToMatching(row, summary, extracted, logs);
  }

  const newPipeline: PipelineState = {
    phase: "extracting",
    chunks,
    nextChunkIndex: nextIndex,
    extracted,
  };
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      stage,
      progress: pct,
      logs: logs as never,
      summary: { ...summary, pipeline: newPipeline } as never,
    } as never)
    .eq("id", row.id);

  return { status: "processing", stage, progress: pct, done: false };
}

async function flipToMatching(
  row: ImportRow,
  summary: Record<string, unknown>,
  extracted: ExtractedProposal[],
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  const capped = extracted.slice(0, MAX_PROPOSALS_PER_IMPORT);
  const deduped = dedupeWithinBatch(capped);
  const stage = `Matching ${deduped.length} proposals against existing…`;
  logs.push({ at: new Date().toISOString(), pct: 92, stage });

  const newPipeline: PipelineState = {
    phase: "matching",
    extracted: deduped,
  };
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      stage,
      progress: 92,
      logs: logs as never,
      summary: { ...summary, pipeline: newPipeline } as never,
    } as never)
    .eq("id", row.id);

  return { status: "processing", stage, progress: 92, done: false };
}

// ---------------------------------------------------------------------------
// Phase: matching → ready
// Single tick: run the trgm RPC for every deduped proposal and persist the
// final ReviewRow[] as `extracted` for the review UI.
// ---------------------------------------------------------------------------

async function stepMatching(
  row: ImportRow,
  summary: Record<string, unknown>,
  pipeline: PipelineState,
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  const deduped = pipeline.extracted ?? [];
  const reviewRows = await attachMatches(deduped, row.party_id);
  const stage = `Ready — ${reviewRows.length} proposals extracted`;
  logs.push({ at: new Date().toISOString(), pct: 100, stage });

  const cleanedSummary = { ...summary };
  delete (cleanedSummary as Record<string, unknown>).pipeline;

  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      status: "ready",
      stage,
      progress: 100,
      extracted: reviewRows as never,
      logs: logs as never,
      summary: cleanedSummary as never,
      finished_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id);

  return { status: "ready", stage, progress: 100, done: true };
}

// ---------------------------------------------------------------------------
// Failure path — write the error to the row and surface it to the UI.
// ---------------------------------------------------------------------------

async function failRow(
  importId: string,
  err: unknown,
  logs: { at: string; pct: number; stage: string }[],
): Promise<TickResult> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  console.error("manifesto import step failed:", message, stack);
  logs.push({ at: new Date().toISOString(), pct: -1, stage: `ERROR: ${message}` });
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({
      status: "failed",
      error: message,
      error_stack: stack,
      stage: "Failed",
      progress: 100,
      logs: logs as never,
      finished_at: new Date().toISOString(),
    } as never)
    .eq("id", importId);
  return { status: "failed", stage: "Failed", progress: 100, done: true };
}

async function loadRow(importId: string): Promise<ImportRow | null> {
  const { data, error } = await supabaseAdmin
    .from("manifesto_imports" as never)
    .select("id, party_id, source_url, source_kind, file_path, language, status, stage, progress, logs, summary")
    .eq("id", importId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ImportRow | null;
}

// ---------------------------------------------------------------------------
// Source loading (download / archive / OCR fallback)
// ---------------------------------------------------------------------------

interface LoadSourceInput {
  sourceKind: "pdf" | "html" | "upload";
  sourceUrl: string | null;
  filePath: string | null;
  partyId: string;
}

async function loadSource(
  input: LoadSourceInput,
): Promise<{ pages: PageText[]; archivedPath: string | null; pageCount: number }> {
  if (input.sourceKind === "html") {
    if (!input.sourceUrl) throw new Error("HTML source requires a URL");
    const md = await firecrawlScrapeHtml(input.sourceUrl);
    return { pages: [{ page: null, text: md }], archivedPath: null, pageCount: 1 };
  }

  let pdfBytes: Uint8Array;
  let archivedPath: string | null = null;

  if (input.sourceKind === "upload") {
    if (!input.filePath) throw new Error("Upload source requires a file path");
    const { data, error } = await supabaseAdmin.storage
      .from("manifestos")
      .download(input.filePath);
    if (error || !data) throw new Error(`Could not read uploaded PDF: ${error?.message ?? "missing"}`);
    pdfBytes = new Uint8Array(await data.arrayBuffer());
    archivedPath = input.filePath;
  } else {
    if (!input.sourceUrl) throw new Error("PDF source requires a URL");
    const res = await fetch(input.sourceUrl, {
      headers: { "User-Agent": "ElezzjoniManifestoBot/1.0" },
    });
    if (!res.ok) throw new Error(`Failed to download PDF (${res.status})`);
    pdfBytes = new Uint8Array(await res.arrayBuffer());
    const path = `${input.partyId}/${Date.now()}-${safeFilename(input.sourceUrl)}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("manifestos")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (!upErr) archivedPath = path;
  }

  const pages = await extractPdfPages(pdfBytes);
  const totalChars = pages.reduce((s, p) => s + p.text.length, 0);
  if (totalChars < 500 && input.sourceUrl) {
    console.warn(`PDF text extraction returned only ${totalChars} chars — falling back to Firecrawl OCR`);
    const md = await firecrawlScrapePdf(input.sourceUrl);
    return { pages: [{ page: null, text: md }], archivedPath, pageCount: pages.length || 1 };
  }
  return { pages, archivedPath, pageCount: pages.length };
}

function safeFilename(url: string): string {
  return url.replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
}

// ---------------------------------------------------------------------------
// PDF extraction (unpdf — Worker/edge runtime compatible, no DOMMatrix needed)
// ---------------------------------------------------------------------------

async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text ?? ""];
  const limit = Math.min(totalPages ?? pageTexts.length, MAX_PAGES);
  const pages: PageText[] = [];
  for (let i = 0; i < limit; i++) {
    const pageText = (pageTexts[i] ?? "").replace(/\s+/g, " ").trim();
    pages.push({ page: i + 1, text: pageText });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Firecrawl helpers
// ---------------------------------------------------------------------------

async function firecrawlScrapeHtml(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape failed (${res.status})`);
  const json = (await res.json()) as { data?: { markdown?: string } };
  return json.data?.markdown ?? "";
}

async function firecrawlScrapePdf(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], parsers: ["pdf"] }),
  });
  if (!res.ok) throw new Error(`Firecrawl PDF scrape failed (${res.status})`);
  const json = (await res.json()) as { data?: { markdown?: string } };
  return json.data?.markdown ?? "";
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buf = "";
  let firstPage: number | null = null;
  for (const p of pages) {
    const header = p.page != null ? `\n\n[Page ${p.page}]\n` : "\n\n";
    const segment = header + p.text;
    if (buf.length + segment.length > MAX_CHARS_PER_CHUNK && buf.length > 0) {
      chunks.push({ text: buf, firstPage });
      buf = segment;
      firstPage = p.page;
    } else {
      if (firstPage == null) firstPage = p.page;
      buf += segment;
    }
  }
  if (buf.trim().length > 0) chunks.push({ text: buf, firstPage });
  return chunks;
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

async function extractChunk(chunk: Chunk, language: ImportRow["language"]): Promise<ExtractedProposal[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const userPrompt = `Language hint: the manifesto is ${language === "both" ? "bilingual (English + Maltese)" : language === "mt" ? "in Maltese" : "in English"}.

Manifesto chunk:
"""
${chunk.text}
"""`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute");
  if (res.status === 402) throw new Error("AI credits exhausted — top up Lovable AI to continue");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI extraction failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: { proposals?: ExtractedProposal[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("AI returned non-JSON, skipping chunk");
    return [];
  }
  const list = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  return list
    .filter((p) => p && typeof p.title_en === "string" && p.title_en.trim().length > 0)
    .map((p) => ({
      ...p,
      page_number: typeof p.page_number === "number" ? p.page_number : chunk.firstPage ?? undefined,
      verbatim_quote: (p.verbatim_quote ?? "").slice(0, 240),
    }));
}

// ---------------------------------------------------------------------------
// Within-batch dedupe
// ---------------------------------------------------------------------------

function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function dedupeWithinBatch(items: ExtractedProposal[]): ExtractedProposal[] {
  const seen = new Map<string, ExtractedProposal>();
  for (const p of items) {
    const keyEn = normaliseTitle(p.title_en);
    const keyMt = p.title_mt ? normaliseTitle(p.title_mt) : "";
    const key = keyEn || keyMt;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else {
      seen.set(key, {
        ...existing,
        title_mt: existing.title_mt ?? p.title_mt,
        description_mt: existing.description_mt ?? p.description_mt,
      });
    }
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Match against existing proposals via pg_trgm RPC
// ---------------------------------------------------------------------------

async function attachMatches(items: ExtractedProposal[], partyId: string): Promise<ReviewRow[]> {
  const out: ReviewRow[] = [];
  for (const p of items) {
    const candidate = p.title_mt ? `${p.title_en} ${p.title_mt}` : p.title_en;
    const { data, error } = await supabaseAdmin.rpc("find_similar_proposals" as never, {
      _party_id: partyId,
      _title: candidate,
      _threshold: 0.45,
      _limit: 3,
    } as never);
    const matches: MatchSuggestion[] = error || !Array.isArray(data) ? [] : (data as MatchSuggestion[]);
    const best = matches[0];
    let suggested_action: "create" | "update" | "skip" = "create";
    let suggested_target_id: string | null = null;
    if (best && best.score >= SIMILARITY_THRESHOLD_AUTO_UPDATE) {
      suggested_action = "update";
      suggested_target_id = best.id;
    }
    out.push({ ...p, matches, suggested_action, suggested_target_id });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apply step — unchanged.
// ---------------------------------------------------------------------------

export interface Decision {
  extractedIndex: number;
  action: "create" | "update" | "skip";
  targetId?: string | null;
  fields: {
    title_en: string;
    title_mt?: string | null;
    description_en?: string | null;
    description_mt?: string | null;
    category?: string | null;
    page_number?: number | null;
  };
}

export interface ApplyResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function applyManifestoDecisions(args: {
  importId: string;
  partyId: string;
  sourceUrl: string | null;
  decisions: Decision[];
  actorId: string | null;
}): Promise<ApplyResult> {
  const { importId, partyId, sourceUrl, decisions, actorId } = args;
  const result: ApplyResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const touchedProposalIds: string[] = [];

  for (const d of decisions) {
    if (d.action === "skip") {
      result.skipped++;
      continue;
    }

    try {
      let proposalId: string | null = null;

      if (d.action === "create") {
        const { data, error } = await supabaseAdmin
          .from("proposals")
          .insert({
            title_en: d.fields.title_en,
            title_mt: d.fields.title_mt ?? null,
            description_en: d.fields.description_en ?? null,
            description_mt: d.fields.description_mt ?? null,
            category: d.fields.category ?? null,
            party_id: partyId,
            status: "pending_review",
            source_url: sourceUrl,
            confirmed_in_manifesto: true,
            manifesto_import_id: importId,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        proposalId = (data as { id: string }).id;
        result.created++;
        touchedProposalIds.push(proposalId);
      } else if (d.action === "update") {
        if (!d.targetId) throw new Error("update action missing targetId");
        const { data: target, error: tErr } = await supabaseAdmin
          .from("proposals")
          .select("id, party_id")
          .eq("id", d.targetId)
          .maybeSingle();
        if (tErr) throw tErr;
        if (!target) throw new Error(`target proposal ${d.targetId} not found`);
        if (target.party_id !== partyId) throw new Error(`target belongs to a different party`);

        const { error } = await supabaseAdmin
          .from("proposals")
          .update({
            title_en: d.fields.title_en,
            title_mt: d.fields.title_mt ?? null,
            description_en: d.fields.description_en ?? null,
            description_mt: d.fields.description_mt ?? null,
            category: d.fields.category ?? null,
            confirmed_in_manifesto: true,
            manifesto_import_id: importId,
          } as never)
          .eq("id", d.targetId);
        if (error) throw error;
        proposalId = d.targetId;
        result.updated++;
        touchedProposalIds.push(proposalId);
      }

      if (proposalId && sourceUrl) {
        const { data: existingSource } = await supabaseAdmin
          .from("proposal_sources")
          .select("id")
          .eq("proposal_id", proposalId)
          .eq("url", sourceUrl)
          .maybeSingle();
        if (!existingSource) {
          await supabaseAdmin.from("proposal_sources").insert({
            proposal_id: proposalId,
            url: sourceUrl,
            label: "Manifesto",
            note:
              d.fields.page_number != null
                ? `Page ${d.fields.page_number} (manifesto import)`
                : "Manifesto import",
            added_by: actorId,
          } as never);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("manifesto apply row failed", message);
      result.errors.push(message);
    }
  }

  if (touchedProposalIds.length > 0) {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (apiKey) {
      try {
        await tagProposalsBatch(apiKey, touchedProposalIds);
      } catch (err) {
        console.error("manifesto apply geo-tag batch failed:", err);
      }
    }
  }

  return result;
}
