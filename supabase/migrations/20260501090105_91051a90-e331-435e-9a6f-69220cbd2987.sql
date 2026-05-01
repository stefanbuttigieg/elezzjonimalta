ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS leadership_role text
  CHECK (leadership_role IN ('leader', 'deputy_leader'));