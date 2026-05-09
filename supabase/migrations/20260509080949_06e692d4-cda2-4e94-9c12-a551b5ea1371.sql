ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS commission_confirmed_at timestamp with time zone;