// Server-only manifesto ingestion pipeline.
//
// Flow:
//   1. Resolve source: PDF URL → download | uploaded file → fetch from storage | HTML page.
//   2. Extract text per page (pdfjs-dist) OR scrape markdown (Firecrawl) for HTML.
//   3. Chunk by section, send each chunk to Gemini for structured proposal extraction.
//   4. Deduplicate within batch + against existing proposals (pg_trgm via RPC).
//   5. Persist progress + final extracted[] on the manifesto_imports row.
//
// Heavy work runs inside startManifestoImport (server function) so the UI just polls
// getManifestoImportStatus until status flips to 'ready' or 'failed'.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Hard caps to protect cost + DB.
const MAX_PROPOSALS_PER_IMPORT = 500;
const MAX_PAGES = 200;
const MAX_CHARS_PER_CHUNK = 28_000; // ~7k tokens, leaves headroom for prompt + JSON output
const MAX_CONCURRENT_CHUNKS = 2;
const SIMILARITY_THRESHOLD_AUTO_UPDATE = 0.78; // exact-ish title → auto pre-select Update existing

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
  // Default action the UI will pre-select.
  suggested_action: "create" | "update" | "skip";
  suggested_target_id: string | null;
}

interface RunInput {
  importId: string;
  partyId: string;
  language: "en" | "mt" | "both";
  sourceKind: "pdf" | "html" | "upload";
  sourceUrl?: string | null;
  filePath?: string | null; // path inside `manifestos` bucket for uploaded PDFs
}

// ---------------------------------------------------------------------------
// Public entry point — runs the whole pipeline and updates the row in place.
// ---------------------------------------------------------------------------

export async function runManifestoImport(input: RunInput): Promise<void> {
  const { importId } = input;
  try {
    await setStage(importId, "Fetching source…");
    const { pages, archivedPath, pageCount } = await loadSource(input);

    await supabaseAdmin
      .from("manifesto_imports" as never)
      .update({ page_count: pageCount, file_path: archivedPath ?? input.filePath ?? null } as never)
      .eq("id", importId);

    await setStage(importId, `Extracting proposals from ${pageCount} pages…`);
    const chunks = chunkPages(pages);
    const extracted: ExtractedProposal[] = [];

    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
      const slice = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
      const results = await Promise.all(slice.map((c) => extractChunk(c, input.language)));
      for (const r of results) extracted.push(...r);
      await setStage(
        importId,
        `Extracting proposals… (${Math.min(i + MAX_CONCURRENT_CHUNKS, chunks.length)}/${chunks.length} chunks, ${extracted.length} proposals so far)`,
      );
      if (extracted.length >= MAX_PROPOSALS_PER_IMPORT) break;
    }

    const capped = extracted.slice(0, MAX_PROPOSALS_PER_IMPORT);
    const deduped = dedupeWithinBatch(capped);

    await setStage(importId, `Matching ${deduped.length} proposals against existing…`);
    const reviewRows = await attachMatches(deduped, input.partyId);

    await supabaseAdmin
      .from("manifesto_imports" as never)
      .update({
        status: "ready",
        stage: `Ready — ${reviewRows.length} proposals extracted`,
        extracted: reviewRows as never,
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", importId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("manifesto import failed:", message);
    await supabaseAdmin
      .from("manifesto_imports" as never)
      .update({
        status: "failed",
        error: message,
        stage: "Failed",
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", importId);
  }
}

async function setStage(importId: string, stage: string) {
  await supabaseAdmin
    .from("manifesto_imports" as never)
    .update({ stage } as never)
    .eq("id", importId);
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

interface PageText {
  page: number | null;
  text: string;
}

async function loadSource(
  input: RunInput,
): Promise<{ pages: PageText[]; archivedPath: string | null; pageCount: number }> {
  if (input.sourceKind === "html") {
    if (!input.sourceUrl) throw new Error("HTML source requires a URL");
    const md = await firecrawlScrapeHtml(input.sourceUrl);
    return { pages: [{ page: null, text: md }], archivedPath: null, pageCount: 1 };
  }

  // PDF — either upload (already in storage) or URL (download then archive).
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
    // Archive a copy so the source survives party site changes.
    const path = `${input.partyId}/${Date.now()}-${safeFilename(input.sourceUrl)}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("manifestos")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (!upErr) archivedPath = path;
  }

  const pages = await extractPdfPages(pdfBytes);

  // OCR fallback when extraction yielded almost nothing — typical of scanned PDFs.
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
// PDF extraction (pdfjs-dist legacy build is Worker-compatible)
// ---------------------------------------------------------------------------

async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  // Use legacy build — pure JS, no DOM/Canvas dependencies.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable worker — we run in a single-threaded Worker context already.
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pages: PageText[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => {
        const it = item as { str?: string };
        return typeof it.str === "string" ? it.str : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: i, text });
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
// Chunking — keep page markers so the model can populate page_number
// ---------------------------------------------------------------------------

interface Chunk {
  text: string;
  firstPage: number | null;
}

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

async function extractChunk(chunk: Chunk, language: RunInput["language"]): Promise<ExtractedProposal[]> {
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
  // Backfill page_number from chunk hint if model didn't populate it.
  return list
    .filter((p) => p && typeof p.title_en === "string" && p.title_en.trim().length > 0)
    .map((p) => ({
      ...p,
      page_number: typeof p.page_number === "number" ? p.page_number : chunk.firstPage ?? undefined,
      verbatim_quote: (p.verbatim_quote ?? "").slice(0, 240),
    }));
}

// ---------------------------------------------------------------------------
// Within-batch dedupe — collapse near-identical EN/MT pairs from the same chunk
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
      // Merge — keep first, fill missing language from second.
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
// Apply step — called after staff confirm decisions in the review table
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
      } else if (d.action === "update") {
        if (!d.targetId) throw new Error("update action missing targetId");
        // Validate target exists and belongs to the same party.
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
      }

      // Append the manifesto as a source row (no duplicate URLs per proposal).
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

  return result;
}
