-- Multi-district candidacies (a candidate can contest 2 districts)
CREATE TABLE public.candidate_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
  election_year integer NOT NULL,
  votes_first_count integer,
  elected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, district_id, election_year)
);

CREATE INDEX idx_candidate_districts_candidate ON public.candidate_districts(candidate_id);
CREATE INDEX idx_candidate_districts_district ON public.candidate_districts(district_id);
CREATE INDEX idx_candidate_districts_year ON public.candidate_districts(election_year);

ALTER TABLE public.candidate_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CandidateDistricts public read published"
  ON public.candidate_districts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_id AND c.status = 'published'::review_status
  ));

CREATE POLICY "CandidateDistricts staff read all"
  ON public.candidate_districts FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "CandidateDistricts staff write"
  ON public.candidate_districts FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "CandidateDistricts staff update"
  ON public.candidate_districts FOR UPDATE TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "CandidateDistricts admin delete"
  ON public.candidate_districts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_candidate_districts_updated
  BEFORE UPDATE ON public.candidate_districts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Parliamentary terms (history of MP service)
CREATE TABLE public.parliament_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  legislature_number integer NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  district_id uuid REFERENCES public.districts(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  role text,
  notes text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parliament_terms_candidate ON public.parliament_terms(candidate_id);
CREATE INDEX idx_parliament_terms_legislature ON public.parliament_terms(legislature_number);
CREATE INDEX idx_parliament_terms_party ON public.parliament_terms(party_id);

ALTER TABLE public.parliament_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ParliamentTerms public read published"
  ON public.parliament_terms FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_id AND c.status = 'published'::review_status
  ));

CREATE POLICY "ParliamentTerms staff read all"
  ON public.parliament_terms FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "ParliamentTerms staff write"
  ON public.parliament_terms FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "ParliamentTerms staff update"
  ON public.parliament_terms FOR UPDATE TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "ParliamentTerms admin delete"
  ON public.parliament_terms FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_parliament_terms_updated
  BEFORE UPDATE ON public.parliament_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();