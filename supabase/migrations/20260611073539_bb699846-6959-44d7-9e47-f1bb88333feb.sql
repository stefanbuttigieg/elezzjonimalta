ALTER TABLE public.candidates
  ADD COLUMN casual_nomination_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN casual_nomination_date date,
  ADD COLUMN casual_nomination_district_id uuid REFERENCES public.districts(id) ON DELETE SET NULL,
  ADD COLUMN casual_nomination_source_url text,
  ADD COLUMN casual_nomination_note_en text,
  ADD COLUMN casual_nomination_note_mt text;

CREATE INDEX idx_candidates_casual_nomination ON public.candidates(casual_nomination_submitted) WHERE casual_nomination_submitted = true;
CREATE INDEX idx_candidates_casual_district ON public.candidates(casual_nomination_district_id);