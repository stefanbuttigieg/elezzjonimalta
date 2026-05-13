-- Geo tagging for proposals
DO $$ BEGIN
  CREATE TYPE public.proposal_geo_scope AS ENUM ('national', 'regional', 'local');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS geo_scope public.proposal_geo_scope NOT NULL DEFAULT 'national',
  ADD COLUMN IF NOT EXISTS localities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS district_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS geo_tagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS geo_tagged_by text;

CREATE INDEX IF NOT EXISTS idx_proposals_localities ON public.proposals USING GIN (localities);
CREATE INDEX IF NOT EXISTS idx_proposals_district_ids ON public.proposals USING GIN (district_ids);
CREATE INDEX IF NOT EXISTS idx_proposals_geo_scope ON public.proposals (geo_scope);