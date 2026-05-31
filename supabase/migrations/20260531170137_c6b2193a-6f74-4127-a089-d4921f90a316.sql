
-- 1. Add elected_via_gcm flag on candidate_districts
ALTER TABLE public.candidate_districts
  ADD COLUMN IF NOT EXISTS elected_via_gcm boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS candidate_districts_elected_via_gcm_idx
  ON public.candidate_districts (election_year, elected_via_gcm)
  WHERE elected_via_gcm = true;

-- 2. Per-party / per-gender GCM seat allocation summary (for public display)
CREATE TABLE IF NOT EXISTS public.gcm_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  election_year integer NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE CASCADE,
  gender text NOT NULL CHECK (gender IN ('female','male','other')),
  seats integer NOT NULL DEFAULT 0 CHECK (seats >= 0),
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_year, party_id, gender)
);

GRANT SELECT ON public.gcm_allocations TO anon, authenticated;
GRANT ALL ON public.gcm_allocations TO service_role;

ALTER TABLE public.gcm_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GcmAllocations public read"
  ON public.gcm_allocations FOR SELECT
  TO public
  USING (true);

CREATE POLICY "GcmAllocations staff insert"
  ON public.gcm_allocations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "GcmAllocations staff update"
  ON public.gcm_allocations FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "GcmAllocations admin delete"
  ON public.gcm_allocations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER gcm_allocations_set_updated_at
  BEFORE UPDATE ON public.gcm_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
