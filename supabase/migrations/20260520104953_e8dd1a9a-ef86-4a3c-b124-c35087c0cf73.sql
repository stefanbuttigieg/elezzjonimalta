
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS ai_extracted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_edited_at timestamptz;

UPDATE public.proposals
  SET ai_extracted = true
  WHERE manifesto_import_id IS NOT NULL
    AND ai_extracted = false;

CREATE INDEX IF NOT EXISTS idx_proposals_ai_extracted_unedited
  ON public.proposals (ai_extracted)
  WHERE ai_extracted = true AND manually_edited_at IS NULL;
