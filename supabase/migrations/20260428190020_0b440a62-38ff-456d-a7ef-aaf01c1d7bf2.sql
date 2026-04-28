CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_mt text,
  description_en text,
  description_mt text,
  category text,
  party_id uuid REFERENCES public.parties(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  status review_status NOT NULL DEFAULT 'pending_review'::review_status,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposals_link_required CHECK (party_id IS NOT NULL OR candidate_id IS NOT NULL)
);

CREATE INDEX idx_proposals_party ON public.proposals(party_id);
CREATE INDEX idx_proposals_candidate ON public.proposals(candidate_id);
CREATE INDEX idx_proposals_status ON public.proposals(status);
CREATE INDEX idx_proposals_category ON public.proposals(category);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposals public read published"
  ON public.proposals FOR SELECT
  USING (status = 'published'::review_status);

CREATE POLICY "Proposals staff read all"
  ON public.proposals FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Proposals staff write"
  ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Proposals staff update"
  ON public.proposals FOR UPDATE TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Proposals admin delete"
  ON public.proposals FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_proposals_updated
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();