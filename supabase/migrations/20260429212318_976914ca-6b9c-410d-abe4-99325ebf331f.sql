-- Categories table for proposals
CREATE TABLE public.proposal_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL UNIQUE,
  name_mt TEXT,
  description_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProposalCategories public read"
  ON public.proposal_categories FOR SELECT
  TO public USING (true);

CREATE POLICY "ProposalCategories staff insert"
  ON public.proposal_categories FOR INSERT
  TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalCategories staff update"
  ON public.proposal_categories FOR UPDATE
  TO authenticated USING (app_private.is_staff(auth.uid()));

CREATE POLICY "ProposalCategories admin delete"
  ON public.proposal_categories FOR DELETE
  TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_proposal_categories_updated_at
  BEFORE UPDATE ON public.proposal_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with existing categories plus Gozo
INSERT INTO public.proposal_categories (slug, name_en, sort_order) VALUES
  ('disability-carers', 'Disability & Carers', 10),
  ('economy', 'Economy', 20),
  ('education', 'Education', 30),
  ('energy', 'Energy', 40),
  ('family', 'Family', 50),
  ('governance', 'Governance', 60),
  ('gozo', 'Gozo', 65),
  ('health', 'Health', 70),
  ('housing', 'Housing', 80),
  ('pensions', 'Pensions', 90),
  ('transport', 'Transport', 100)
ON CONFLICT (slug) DO NOTHING;