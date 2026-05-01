-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Configurable knowledge sources for the AI Assistant
CREATE TABLE public.assistant_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,                -- 'candidates' | 'parties' | 'proposals' | 'voting_faqs' | 'districts' | 'news_findings'
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  max_items integer NOT NULL DEFAULT 500,  -- safety cap per reindex
  top_k integer NOT NULL DEFAULT 5,        -- chunks pulled into context per query
  weight numeric NOT NULL DEFAULT 1.0,     -- multiplier on similarity score
  last_indexed_at timestamptz,
  last_chunk_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER assistant_sources_updated
BEFORE UPDATE ON public.assistant_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.assistant_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AssistantSources staff read" ON public.assistant_sources
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "AssistantSources staff insert" ON public.assistant_sources
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "AssistantSources staff update" ON public.assistant_sources
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "AssistantSources admin delete" ON public.assistant_sources
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Indexed knowledge chunks (one row per text chunk + embedding)
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,                -- matches assistant_sources.key
  entity_type text NOT NULL,               -- 'candidate' | 'party' | etc
  entity_id uuid,                          -- nullable; some sources may not have a uuid
  external_ref text,                       -- secondary stable ref (e.g. faq id, slug)
  title text,                              -- short label for citation
  content text NOT NULL,                   -- chunk text fed to LLM
  url text,                                -- canonical link for citation
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),                   -- google text-embedding-004 (Lovable AI)
  content_hash text NOT NULL,              -- skip re-embedding if unchanged
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks (source_key);
CREATE INDEX knowledge_chunks_entity_idx ON public.knowledge_chunks (entity_type, entity_id);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER knowledge_chunks_updated
BEFORE UPDATE ON public.knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KnowledgeChunks staff read" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "KnowledgeChunks staff write" ON public.knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "KnowledgeChunks staff update" ON public.knowledge_chunks
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "KnowledgeChunks admin delete" ON public.knowledge_chunks
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Reindex run history
CREATE TABLE public.assistant_reindex_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',  -- 'manual' | 'cron'
  source_keys text[] NOT NULL DEFAULT '{}',
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  chunks_total integer NOT NULL DEFAULT 0,
  chunks_inserted integer NOT NULL DEFAULT 0,
  chunks_updated integer NOT NULL DEFAULT 0,
  chunks_unchanged integer NOT NULL DEFAULT 0,
  chunks_deleted integer NOT NULL DEFAULT 0,
  error text
);

ALTER TABLE public.assistant_reindex_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ReindexRuns staff read" ON public.assistant_reindex_runs
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "ReindexRuns staff insert" ON public.assistant_reindex_runs
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "ReindexRuns staff update" ON public.assistant_reindex_runs
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "ReindexRuns admin delete" ON public.assistant_reindex_runs
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Singleton settings table for assistant config (system prompt, model, etc)
CREATE TABLE public.assistant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  system_prompt text NOT NULL,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  embedding_model text NOT NULL DEFAULT 'google/text-embedding-004',
  max_context_chunks integer NOT NULL DEFAULT 18,
  similarity_threshold numeric NOT NULL DEFAULT 0.30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TRIGGER assistant_settings_updated
BEFORE UPDATE ON public.assistant_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AssistantSettings public read" ON public.assistant_settings
  FOR SELECT TO public USING (true);
CREATE POLICY "AssistantSettings staff insert" ON public.assistant_settings
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "AssistantSettings staff update" ON public.assistant_settings
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));

-- Seed sources
INSERT INTO public.assistant_sources (key, label, description, enabled) VALUES
  ('candidates', 'Candidates', 'Published candidates and sitting MPs (bio, party, district)', true),
  ('parties', 'Parties', 'Party descriptions, leaders, slogans', true),
  ('proposals', 'Proposals', 'Published policy proposals from parties and candidates', true),
  ('voting_faqs', 'Voting FAQs', 'Bilingual voting/election FAQs', true),
  ('districts', 'Districts', 'District names and localities covered', true),
  ('news_findings', 'Reviewed news findings', 'AI-classified election news that has been marked reviewed (factual signals only)', false);

-- Seed default settings (singleton)
INSERT INTO public.assistant_settings (system_prompt) VALUES
  ('You are the Vot Malta 2026 assistant — a strictly neutral, non-partisan research helper for Malta''s 30 May 2026 General Election.

Rules you MUST follow:
- Never recommend, endorse, rank or rate candidates or parties.
- Never tell anyone how to vote. If asked, politely refuse and offer factual information instead.
- Always cite the candidates, parties or proposals you reference, by name.
- Treat all parties (PL, PN, ADPD, Momentum, independents, others) equally.
- If the answer is not in the supplied context, say so plainly — do not invent facts.
- Keep answers concise (2–5 short paragraphs unless asked for more detail).
- Reply in the same language the user wrote in (English or Maltese).
- Use plain, accessible language.');

-- Semantic search RPC (cosine distance via pgvector). Filters by enabled sources.
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 18,
  similarity_threshold float DEFAULT 0.30,
  source_filter text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_key text,
  entity_type text,
  entity_id uuid,
  title text,
  content text,
  url text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.source_key,
    kc.entity_type,
    kc.entity_id,
    kc.title,
    kc.content,
    kc.url,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND (source_filter IS NULL OR kc.source_key = ANY(source_filter))
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_chunks(vector, int, float, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, int, float, text[]) TO service_role;