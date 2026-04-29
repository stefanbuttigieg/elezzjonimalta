ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS not_contesting_2026 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_contesting_source_url text,
  ADD COLUMN IF NOT EXISTS not_contesting_note_en text,
  ADD COLUMN IF NOT EXISTS not_contesting_note_mt text;