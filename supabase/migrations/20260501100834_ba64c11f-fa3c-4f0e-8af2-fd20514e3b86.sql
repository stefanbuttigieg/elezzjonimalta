-- Voting FAQs table for bilingual FAQ entries pulled from external sources.
CREATE TABLE public.voting_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  source_label text NOT NULL,
  source_url text NOT NULL,
  question_en text NOT NULL,
  answer_en text NOT NULL,
  question_mt text,
  answer_mt text,
  sort_order integer NOT NULL DEFAULT 0,
  status review_status NOT NULL DEFAULT 'published',
  external_hash text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_voting_faqs_source ON public.voting_faqs(source_key, sort_order);
CREATE UNIQUE INDEX idx_voting_faqs_external ON public.voting_faqs(source_key, external_hash) WHERE external_hash IS NOT NULL;

ALTER TABLE public.voting_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "VotingFaqs public read published"
  ON public.voting_faqs FOR SELECT TO public
  USING (status = 'published'::review_status);

CREATE POLICY "VotingFaqs staff read all"
  ON public.voting_faqs FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqs staff insert"
  ON public.voting_faqs FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqs staff update"
  ON public.voting_faqs FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqs admin delete"
  ON public.voting_faqs FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_voting_faqs_updated_at
  BEFORE UPDATE ON public.voting_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track sync runs for the FAQ scraper
CREATE TABLE public.voting_faq_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_found integer NOT NULL DEFAULT 0,
  items_added integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  triggered_by uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voting_faq_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "VotingFaqSync staff read"
  ON public.voting_faq_sync_runs FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqSync staff insert"
  ON public.voting_faq_sync_runs FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqSync staff update"
  ON public.voting_faq_sync_runs FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "VotingFaqSync admin delete"
  ON public.voting_faq_sync_runs FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));