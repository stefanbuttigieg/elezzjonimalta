-- ============================================================
-- Manifesto Import infrastructure
-- ============================================================

-- 1. Trigram extension for fuzzy title matching during dedupe
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes on proposal titles for fast similarity search
CREATE INDEX IF NOT EXISTS proposals_title_en_trgm_idx
  ON public.proposals USING gin (title_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS proposals_title_mt_trgm_idx
  ON public.proposals USING gin (title_mt gin_trgm_ops);

-- 3. manifesto_imports table — tracks each ingestion run
CREATE TABLE public.manifesto_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id        uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  source_url      text,
  source_kind     text NOT NULL CHECK (source_kind IN ('pdf','html','upload')),
  file_path       text,                            -- path in `manifestos` bucket
  language        text NOT NULL DEFAULT 'en' CHECK (language IN ('en','mt','both')),
  page_count      integer,
  status          text NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','ready','applied','failed','cancelled')),
  stage           text,                            -- human-readable progress label
  error           text,
  extracted       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{title_en, title_mt?, description_en, ..., page, verbatim_quote, matches:[...]}]
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {created, updated, skipped}
  imported_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX manifesto_imports_party_idx ON public.manifesto_imports(party_id, created_at DESC);
CREATE INDEX manifesto_imports_status_idx ON public.manifesto_imports(status);

ALTER TABLE public.manifesto_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ManifestoImports staff read"
  ON public.manifesto_imports FOR SELECT
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ManifestoImports staff insert"
  ON public.manifesto_imports FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "ManifestoImports staff update"
  ON public.manifesto_imports FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ManifestoImports admin delete"
  ON public.manifesto_imports FOR DELETE
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_manifesto_imports_updated_at
  BEFORE UPDATE ON public.manifesto_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Proposals: link back to manifesto + confirmation flag
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS confirmed_in_manifesto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manifesto_import_id uuid REFERENCES public.manifesto_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_manifesto_import_idx
  ON public.proposals(manifesto_import_id)
  WHERE manifesto_import_id IS NOT NULL;

-- 5. Private storage bucket for archived manifesto PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('manifestos', 'manifestos', false)
ON CONFLICT (id) DO NOTHING;

-- Staff-only storage policies
CREATE POLICY "Manifestos staff read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'manifestos' AND app_private.is_staff(auth.uid()));

CREATE POLICY "Manifestos staff insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'manifestos' AND app_private.is_staff(auth.uid()));

CREATE POLICY "Manifestos staff update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'manifestos' AND app_private.is_staff(auth.uid()));

CREATE POLICY "Manifestos admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'manifestos' AND app_private.has_role(auth.uid(), 'admin'::app_role));

-- 6. SQL helper for trigram match — used by extract pipeline.
-- Returns top similar proposals for a given party + title.
CREATE OR REPLACE FUNCTION public.find_similar_proposals(
  _party_id uuid,
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
    p.id,
    p.title_en,
    p.title_mt,
    p.description_en,
    p.status,
    GREATEST(
      similarity(coalesce(p.title_en,''), _title),
      similarity(coalesce(p.title_mt,''), _title)
    )::real AS score
  FROM public.proposals p
  WHERE p.party_id = _party_id
    AND p.merged_into_id IS NULL
    AND (
      similarity(coalesce(p.title_en,''), _title) > _threshold
      OR similarity(coalesce(p.title_mt,''), _title) > _threshold
    )
  ORDER BY score DESC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.find_similar_proposals(uuid, text, real, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_similar_proposals(uuid, text, real, integer) TO authenticated;