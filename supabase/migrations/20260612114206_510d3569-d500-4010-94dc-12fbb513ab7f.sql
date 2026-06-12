ALTER TABLE public.candidate_districts
  ADD COLUMN IF NOT EXISTS relinquished boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS candidate_districts_relinquished_idx
  ON public.candidate_districts (election_year)
  WHERE relinquished = true;