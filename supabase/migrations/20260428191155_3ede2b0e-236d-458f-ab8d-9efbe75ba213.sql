ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS leader_name text,
  ADD COLUMN IF NOT EXISTS slogan_en text,
  ADD COLUMN IF NOT EXISTS slogan_mt text,
  ADD COLUMN IF NOT EXISTS wikipedia_url text;