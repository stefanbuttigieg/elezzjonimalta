ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_idx
  ON public.knowledge_chunks USING gin (search_tsv);

ALTER TABLE public.knowledge_chunks
  ALTER COLUMN embedding DROP NOT NULL;

DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector, integer, double precision, text[]);

CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_text text,
  match_count integer DEFAULT 18,
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
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('simple', coalesce(query_text, '')) AS tsq
  )
  SELECT
    kc.id,
    kc.source_key,
    kc.entity_type,
    kc.entity_id,
    kc.title,
    kc.content,
    kc.url,
    kc.metadata,
    ts_rank(kc.search_tsv, q.tsq)::double precision AS similarity
  FROM public.knowledge_chunks kc, q
  WHERE (source_filter IS NULL OR kc.source_key = ANY(source_filter))
    AND (q.tsq IS NULL OR kc.search_tsv @@ q.tsq)
  ORDER BY
    CASE WHEN q.tsq IS NULL THEN 0 ELSE ts_rank(kc.search_tsv, q.tsq) END DESC,
    kc.updated_at DESC
  LIMIT match_count;
$$;