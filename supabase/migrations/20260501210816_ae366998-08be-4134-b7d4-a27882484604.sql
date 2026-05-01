-- Many-to-many between proposals and proposal_categories.
-- We keep the legacy `proposals.category` text column so existing read paths
-- (public pages, search, assistant indexing) continue to work; the admin UI
-- will keep it in sync with the first selected category for now.

CREATE TABLE IF NOT EXISTS public.proposal_category_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.proposal_categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_pca_proposal ON public.proposal_category_assignments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_pca_category ON public.proposal_category_assignments(category_id);

ALTER TABLE public.proposal_category_assignments ENABLE ROW LEVEL SECURITY;

-- Public can read assignments tied to published, non-merged proposals.
CREATE POLICY "ProposalCategoryAssignments public read published"
  ON public.proposal_category_assignments
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_category_assignments.proposal_id
        AND p.status = 'published'::review_status
        AND p.merged_into_id IS NULL
    )
  );

CREATE POLICY "ProposalCategoryAssignments staff read all"
  ON public.proposal_category_assignments
  FOR SELECT
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalCategoryAssignments staff insert"
  ON public.proposal_category_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalCategoryAssignments staff update"
  ON public.proposal_category_assignments
  FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalCategoryAssignments admin delete"
  ON public.proposal_category_assignments
  FOR DELETE
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Backfill from the legacy text column where it matches an existing category name.
INSERT INTO public.proposal_category_assignments (proposal_id, category_id, sort_order)
SELECT p.id, c.id, 0
FROM public.proposals p
JOIN public.proposal_categories c
  ON lower(trim(c.name_en)) = lower(trim(p.category))
WHERE p.category IS NOT NULL AND length(trim(p.category)) > 0
ON CONFLICT (proposal_id, category_id) DO NOTHING;