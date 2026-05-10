-- Trigram indexes on community proposal titles for fuzzy dedupe
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS community_proposals_title_en_trgm_idx
  ON public.community_proposals USING gin (title_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS community_proposals_title_mt_trgm_idx
  ON public.community_proposals USING gin (title_mt gin_trgm_ops);

-- community_imports table — tracks each ingestion run for a community author
CREATE TABLE public.community_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid NOT NULL REFERENCES public.community_authors(id) ON DELETE CASCADE,
  source_url      text,
  source_kind     text NOT NULL CHECK (source_kind IN ('pdf','html','upload')),
  file_path       text,
  language        text NOT NULL DEFAULT 'en' CHECK (language IN ('en','mt','both')),
  page_count      integer,
  status          text NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','ready','applied','failed','cancelled')),
  stage           text,
  error           text,
  extracted       jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX community_imports_author_idx ON public.community_imports(author_id, created_at DESC);
CREATE INDEX community_imports_status_idx ON public.community_imports(status);

ALTER TABLE public.community_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CommunityImports staff read"
  ON public.community_imports FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityImports staff insert"
  ON public.community_imports FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityImports staff update"
  ON public.community_imports FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityImports admin delete"
  ON public.community_imports FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_community_imports_updated_at
  BEFORE UPDATE ON public.community_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Traceability on community proposals
ALTER TABLE public.community_proposals
  ADD COLUMN IF NOT EXISTS community_import_id uuid REFERENCES public.community_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_proposals_import_idx
  ON public.community_proposals(community_import_id)
  WHERE community_import_id IS NOT NULL;

-- Helper: find existing similar community proposals for an author
CREATE OR REPLACE FUNCTION public.find_similar_community_proposals(
  _author_id uuid,
  _title text,
  _threshold real DEFAULT 0.45,
  _limit integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  title_en text,
  title_mt text,
  description_en text,
  status review_status,
  score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.title_en, p.title_mt, p.description_en, p.status,
    GREATEST(
      similarity(coalesce(p.title_en,''), _title),
      similarity(coalesce(p.title_mt,''), _title)
    )::real AS score
  FROM public.community_proposals p
  WHERE p.author_id = _author_id
    AND (
      similarity(coalesce(p.title_en,''), _title) > _threshold
      OR similarity(coalesce(p.title_mt,''), _title) > _threshold
    )
  ORDER BY score DESC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.find_similar_community_proposals(uuid, text, real, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_similar_community_proposals(uuid, text, real, integer) TO authenticated;