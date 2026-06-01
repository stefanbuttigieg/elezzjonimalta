ALTER TABLE public.candidate_districts
  ADD COLUMN IF NOT EXISTS elected_via_casual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS candidate_districts_elected_via_casual_idx
  ON public.candidate_districts (election_year)
  WHERE elected_via_casual = true;