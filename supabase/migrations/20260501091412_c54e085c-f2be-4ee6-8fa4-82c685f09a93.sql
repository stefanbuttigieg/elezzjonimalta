ALTER TABLE public.proposals
  ADD COLUMN merged_into_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD COLUMN merged_at timestamptz,
  ADD COLUMN merge_note text;

CREATE INDEX idx_proposals_merged_into ON public.proposals(merged_into_id) WHERE merged_into_id IS NOT NULL;