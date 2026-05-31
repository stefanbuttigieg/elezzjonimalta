-- Proportionality (casual election / proportionality adjustment) mechanism tracking
ALTER TABLE public.candidate_districts
  ADD COLUMN elected_via_proportionality boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS candidate_districts_elected_via_prop_idx
  ON public.candidate_districts (elected_via_proportionality)
  WHERE elected_via_proportionality = true;

CREATE TABLE public.proportionality_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_year integer NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE CASCADE,
  seats integer NOT NULL DEFAULT 0,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_year, party_id)
);

GRANT SELECT ON public.proportionality_allocations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proportionality_allocations TO authenticated;
GRANT ALL ON public.proportionality_allocations TO service_role;

ALTER TABLE public.proportionality_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProportionalityAllocations public read"
  ON public.proportionality_allocations FOR SELECT
  TO public USING (true);

CREATE POLICY "ProportionalityAllocations staff insert"
  ON public.proportionality_allocations FOR INSERT
  TO authenticated WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "ProportionalityAllocations staff update"
  ON public.proportionality_allocations FOR UPDATE
  TO authenticated USING (is_staff(auth.uid()));

CREATE POLICY "ProportionalityAllocations admin delete"
  ON public.proportionality_allocations FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
