DROP POLICY IF EXISTS "Proposals public read published" ON public.proposals;
CREATE POLICY "Proposals public read published"
  ON public.proposals FOR SELECT TO public
  USING (status = 'published'::review_status AND merged_into_id IS NULL);