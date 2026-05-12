ALTER TABLE public.manifesto_imports ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE public.community_imports ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;