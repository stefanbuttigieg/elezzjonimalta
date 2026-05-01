-- Multiple source URLs per proposal
CREATE TABLE public.proposal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  note text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_sources_proposal_id ON public.proposal_sources(proposal_id);

ALTER TABLE public.proposal_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProposalSources public read published"
  ON public.proposal_sources FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_sources.proposal_id
      AND p.status = 'published'
      AND p.merged_into_id IS NULL
  ));

CREATE POLICY "ProposalSources staff read all"
  ON public.proposal_sources FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalSources staff insert"
  ON public.proposal_sources FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalSources staff update"
  ON public.proposal_sources FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalSources admin delete"
  ON public.proposal_sources FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_proposal_sources_updated_at
  BEFORE UPDATE ON public.proposal_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: copy existing single source_url into the new table
INSERT INTO public.proposal_sources (proposal_id, url, label)
SELECT id, source_url, 'Primary source'
FROM public.proposals
WHERE source_url IS NOT NULL AND source_url <> '';