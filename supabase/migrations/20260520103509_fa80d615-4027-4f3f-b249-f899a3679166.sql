-- Composite index for the most common query pattern: published proposals sorted by created_at
CREATE INDEX IF NOT EXISTS idx_proposals_status_created_at
  ON public.proposals (status, created_at DESC);

-- Partial index for non-merged proposals (the typical public filter)
CREATE INDEX IF NOT EXISTS idx_proposals_published_active
  ON public.proposals (created_at DESC)
  WHERE status = 'published' AND merged_into_id IS NULL;

-- Foreign-key style filter indexes
CREATE INDEX IF NOT EXISTS idx_proposals_party_id ON public.proposals (party_id);
CREATE INDEX IF NOT EXISTS idx_proposals_candidate_id ON public.proposals (candidate_id);
CREATE INDEX IF NOT EXISTS idx_proposals_merged_into_id ON public.proposals (merged_into_id);
CREATE INDEX IF NOT EXISTS idx_proposals_category ON public.proposals (category);

-- Trigram indexes for ILIKE text search across title/description (EN + MT)
CREATE INDEX IF NOT EXISTS idx_proposals_title_en_trgm
  ON public.proposals USING gin (title_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proposals_title_mt_trgm
  ON public.proposals USING gin (title_mt gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proposals_description_en_trgm
  ON public.proposals USING gin (description_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proposals_description_mt_trgm
  ON public.proposals USING gin (description_mt gin_trgm_ops);