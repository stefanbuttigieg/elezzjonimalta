-- Source kinds for the audit trail
CREATE TYPE public.source_kind AS ENUM ('official', 'manifesto', 'news', 'social', 'other');

CREATE TABLE public.candidate_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind public.source_kind NOT NULL DEFAULT 'official',
  label text NOT NULL,
  url text NOT NULL,
  publisher text,
  note_en text,
  note_mt text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_sources_candidate_id ON public.candidate_sources(candidate_id);
CREATE INDEX idx_candidate_sources_kind ON public.candidate_sources(kind);

ALTER TABLE public.candidate_sources ENABLE ROW LEVEL SECURITY;

-- Public can read sources tied to a published candidate
CREATE POLICY "CandidateSources public read published"
ON public.candidate_sources
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_sources.candidate_id
      AND c.status = 'published'::review_status
  )
);

-- Staff full read
CREATE POLICY "CandidateSources staff read all"
ON public.candidate_sources
FOR SELECT
TO authenticated
USING (app_private.is_staff(auth.uid()));

-- Staff write/update
CREATE POLICY "CandidateSources staff write"
ON public.candidate_sources
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CandidateSources staff update"
ON public.candidate_sources
FOR UPDATE
TO authenticated
USING (app_private.is_staff(auth.uid()));

-- Admin delete
CREATE POLICY "CandidateSources admin delete"
ON public.candidate_sources
FOR DELETE
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_candidate_sources_updated_at
BEFORE UPDATE ON public.candidate_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();