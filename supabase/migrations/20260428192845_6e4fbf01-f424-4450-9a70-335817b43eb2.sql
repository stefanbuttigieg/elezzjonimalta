CREATE POLICY "Candidates public read incumbents"
ON public.candidates
FOR SELECT
TO public
USING (is_incumbent = true);

CREATE POLICY "CandidateDistricts public read incumbents"
ON public.candidate_districts
FOR SELECT
TO public
USING (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = candidate_districts.candidate_id
    AND c.is_incumbent = true
));

CREATE POLICY "ParliamentTerms public read incumbents"
ON public.parliament_terms
FOR SELECT
TO public
USING (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = parliament_terms.candidate_id
    AND c.is_incumbent = true
));