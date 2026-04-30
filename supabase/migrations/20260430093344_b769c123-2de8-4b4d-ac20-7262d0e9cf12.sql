
-- Enum for media kinds
DO $$ BEGIN
  CREATE TYPE public.candidate_media_kind AS ENUM ('video','podcast','interview','speech','article');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS office_address text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS birthplace text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS education text,
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS linkedin text,
  ADD COLUMN IF NOT EXISTS youtube text,
  ADD COLUMN IF NOT EXISTS parliament_member_id text,
  ADD COLUMN IF NOT EXISTS parliament_synced_at timestamptz;

-- candidate_media
CREATE TABLE IF NOT EXISTS public.candidate_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind public.candidate_media_kind NOT NULL DEFAULT 'video',
  title text,
  description text,
  url text NOT NULL,
  provider text,
  embed_id text,
  thumbnail_url text,
  published_at date,
  language text,
  status public.review_status NOT NULL DEFAULT 'pending_review',
  source_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_media_candidate_idx ON public.candidate_media(candidate_id);
ALTER TABLE public.candidate_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CandidateMedia public read published" ON public.candidate_media;
CREATE POLICY "CandidateMedia public read published" ON public.candidate_media FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_media.candidate_id AND c.status = 'published'::review_status)
  AND status = 'published'::review_status
);
DROP POLICY IF EXISTS "CandidateMedia staff read all" ON public.candidate_media;
CREATE POLICY "CandidateMedia staff read all" ON public.candidate_media FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateMedia staff write" ON public.candidate_media;
CREATE POLICY "CandidateMedia staff write" ON public.candidate_media FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateMedia staff update" ON public.candidate_media;
CREATE POLICY "CandidateMedia staff update" ON public.candidate_media FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateMedia admin delete" ON public.candidate_media;
CREATE POLICY "CandidateMedia admin delete" ON public.candidate_media FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'::app_role));

DROP TRIGGER IF EXISTS trg_candidate_media_updated_at ON public.candidate_media;
CREATE TRIGGER trg_candidate_media_updated_at BEFORE UPDATE ON public.candidate_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- candidate_positions
CREATE TABLE IF NOT EXISTS public.candidate_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  legislature_number int,
  title text NOT NULL,
  body text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_positions_candidate_idx ON public.candidate_positions(candidate_id);
ALTER TABLE public.candidate_positions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_candidate_position_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_candidate_positions_validate ON public.candidate_positions;
CREATE TRIGGER trg_candidate_positions_validate BEFORE INSERT OR UPDATE ON public.candidate_positions
  FOR EACH ROW EXECUTE FUNCTION public.validate_candidate_position_dates();
DROP TRIGGER IF EXISTS trg_candidate_positions_updated_at ON public.candidate_positions;
CREATE TRIGGER trg_candidate_positions_updated_at BEFORE UPDATE ON public.candidate_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "CandidatePositions public read published" ON public.candidate_positions;
CREATE POLICY "CandidatePositions public read published" ON public.candidate_positions FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_positions.candidate_id AND c.status = 'published'::review_status)
);
DROP POLICY IF EXISTS "CandidatePositions public read incumbents" ON public.candidate_positions;
CREATE POLICY "CandidatePositions public read incumbents" ON public.candidate_positions FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_positions.candidate_id AND c.is_incumbent = true)
);
DROP POLICY IF EXISTS "CandidatePositions staff read all" ON public.candidate_positions;
CREATE POLICY "CandidatePositions staff read all" ON public.candidate_positions FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidatePositions staff write" ON public.candidate_positions;
CREATE POLICY "CandidatePositions staff write" ON public.candidate_positions FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidatePositions staff update" ON public.candidate_positions;
CREATE POLICY "CandidatePositions staff update" ON public.candidate_positions FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidatePositions admin delete" ON public.candidate_positions;
CREATE POLICY "CandidatePositions admin delete" ON public.candidate_positions FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'::app_role));

-- candidate_contributions
CREATE TABLE IF NOT EXISTS public.candidate_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  legislature_number int NOT NULL,
  attendance_pct numeric,
  speeches_count int,
  pmqs_count int,
  bills_sponsored int,
  bills_cosponsored int,
  summary_en text,
  summary_mt text,
  source_url text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, legislature_number)
);
ALTER TABLE public.candidate_contributions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_candidate_contributions_updated_at ON public.candidate_contributions;
CREATE TRIGGER trg_candidate_contributions_updated_at BEFORE UPDATE ON public.candidate_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "CandidateContributions public read published" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions public read published" ON public.candidate_contributions FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_contributions.candidate_id AND c.status = 'published'::review_status)
);
DROP POLICY IF EXISTS "CandidateContributions public read incumbents" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions public read incumbents" ON public.candidate_contributions FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_contributions.candidate_id AND c.is_incumbent = true)
);
DROP POLICY IF EXISTS "CandidateContributions staff read all" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions staff read all" ON public.candidate_contributions FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateContributions staff write" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions staff write" ON public.candidate_contributions FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateContributions staff update" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions staff update" ON public.candidate_contributions FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateContributions admin delete" ON public.candidate_contributions;
CREATE POLICY "CandidateContributions admin delete" ON public.candidate_contributions FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'::app_role));

-- candidate_endorsements
CREATE TABLE IF NOT EXISTS public.candidate_endorsements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  quote_en text,
  quote_mt text,
  attributed_to text NOT NULL,
  attributed_role text,
  source_url text,
  published_at date,
  status public.review_status NOT NULL DEFAULT 'pending_review',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_endorsements_candidate_idx ON public.candidate_endorsements(candidate_id);
ALTER TABLE public.candidate_endorsements ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_candidate_endorsements_updated_at ON public.candidate_endorsements;
CREATE TRIGGER trg_candidate_endorsements_updated_at BEFORE UPDATE ON public.candidate_endorsements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "CandidateEndorsements public read published" ON public.candidate_endorsements;
CREATE POLICY "CandidateEndorsements public read published" ON public.candidate_endorsements FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_endorsements.candidate_id AND c.status = 'published'::review_status)
  AND status = 'published'::review_status
);
DROP POLICY IF EXISTS "CandidateEndorsements staff read all" ON public.candidate_endorsements;
CREATE POLICY "CandidateEndorsements staff read all" ON public.candidate_endorsements FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateEndorsements staff write" ON public.candidate_endorsements;
CREATE POLICY "CandidateEndorsements staff write" ON public.candidate_endorsements FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateEndorsements staff update" ON public.candidate_endorsements;
CREATE POLICY "CandidateEndorsements staff update" ON public.candidate_endorsements FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "CandidateEndorsements admin delete" ON public.candidate_endorsements;
CREATE POLICY "CandidateEndorsements admin delete" ON public.candidate_endorsements FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'::app_role));
