-- Enum for community author kind
DO $$ BEGIN
  CREATE TYPE public.community_author_kind AS ENUM (
    'individual', 'ngo', 'union', 'business', 'academic', 'faith', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- community_authors
-- ----------------------------------------------------------------------------
CREATE TABLE public.community_authors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.community_author_kind NOT NULL DEFAULT 'ngo',
  bio_en text,
  bio_mt text,
  logo_url text,
  website text,
  source_url text,
  status public.review_status NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CommunityAuthors public read published"
  ON public.community_authors FOR SELECT
  USING (status = 'published'::review_status);

CREATE POLICY "CommunityAuthors staff read all"
  ON public.community_authors FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityAuthors staff insert"
  ON public.community_authors FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityAuthors staff update"
  ON public.community_authors FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityAuthors admin delete"
  ON public.community_authors FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_community_authors_updated
  BEFORE UPDATE ON public.community_authors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- community_proposals
-- ----------------------------------------------------------------------------
CREATE TABLE public.community_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.community_authors(id) ON DELETE CASCADE,
  title_en text NOT NULL,
  title_mt text,
  description_en text,
  description_mt text,
  category text,
  source_url text,
  status public.review_status NOT NULL DEFAULT 'pending_review',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_proposals_author ON public.community_proposals(author_id);
CREATE INDEX idx_community_proposals_status ON public.community_proposals(status);

ALTER TABLE public.community_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CommunityProposals public read published"
  ON public.community_proposals FOR SELECT
  USING (
    status = 'published'::review_status
    AND EXISTS (
      SELECT 1 FROM public.community_authors a
      WHERE a.id = community_proposals.author_id
        AND a.status = 'published'::review_status
    )
  );

CREATE POLICY "CommunityProposals staff read all"
  ON public.community_proposals FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityProposals staff insert"
  ON public.community_proposals FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityProposals staff update"
  ON public.community_proposals FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityProposals admin delete"
  ON public.community_proposals FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_community_proposals_updated
  BEFORE UPDATE ON public.community_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- community_proposal_links (community <-> party proposal)
-- ----------------------------------------------------------------------------
CREATE TABLE public.community_proposal_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_proposal_id uuid NOT NULL REFERENCES public.community_proposals(id) ON DELETE CASCADE,
  party_proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_proposal_id, party_proposal_id)
);

CREATE INDEX idx_cpl_party ON public.community_proposal_links(party_proposal_id);
CREATE INDEX idx_cpl_community ON public.community_proposal_links(community_proposal_id);

ALTER TABLE public.community_proposal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CommunityProposalLinks public read published"
  ON public.community_proposal_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_proposals cp
      JOIN public.community_authors a ON a.id = cp.author_id
      WHERE cp.id = community_proposal_links.community_proposal_id
        AND cp.status = 'published'::review_status
        AND a.status = 'published'::review_status
    )
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = community_proposal_links.party_proposal_id
        AND p.status = 'published'::review_status
        AND p.merged_into_id IS NULL
    )
  );

CREATE POLICY "CommunityProposalLinks staff read all"
  ON public.community_proposal_links FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityProposalLinks staff insert"
  ON public.community_proposal_links FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CommunityProposalLinks staff delete"
  ON public.community_proposal_links FOR DELETE TO authenticated
  USING (app_private.is_staff(auth.uid()));