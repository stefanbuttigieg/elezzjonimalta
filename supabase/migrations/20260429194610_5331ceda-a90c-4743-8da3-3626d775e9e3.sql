
-- Enums
CREATE TYPE public.news_finding_kind AS ENUM ('proposal','new_candidate','election_development','not_relevant');
CREATE TYPE public.news_finding_status AS ENUM ('pending','accepted','dismissed','reviewed');
CREATE TYPE public.news_scan_trigger AS ENUM ('cron','manual');

-- news_sources
CREATE TABLE public.news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  base_url text NOT NULL,
  sitemap_url text,
  enabled boolean NOT NULL DEFAULT true,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NewsSources staff read" ON public.news_sources FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsSources staff insert" ON public.news_sources FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsSources staff update" ON public.news_sources FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsSources admin delete" ON public.news_sources FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_news_sources_updated_at BEFORE UPDATE ON public.news_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- news_articles
CREATE TABLE public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  url text NOT NULL UNIQUE,
  title text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  scan_status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_articles_source ON public.news_articles(source_id);
CREATE INDEX idx_news_articles_fetched ON public.news_articles(fetched_at DESC);
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NewsArticles staff read" ON public.news_articles FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsArticles staff insert" ON public.news_articles FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsArticles staff update" ON public.news_articles FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsArticles admin delete" ON public.news_articles FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'));

-- news_findings
CREATE TABLE public.news_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  kind public.news_finding_kind NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0,
  title text,
  summary_en text,
  summary_mt text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  status public.news_finding_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_findings_status ON public.news_findings(status);
CREATE INDEX idx_news_findings_kind ON public.news_findings(kind);
CREATE INDEX idx_news_findings_article ON public.news_findings(article_id);
ALTER TABLE public.news_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NewsFindings staff read" ON public.news_findings FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsFindings staff insert" ON public.news_findings FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsFindings staff update" ON public.news_findings FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsFindings admin delete" ON public.news_findings FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_news_findings_updated_at BEFORE UPDATE ON public.news_findings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- news_scan_runs
CREATE TABLE public.news_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger public.news_scan_trigger NOT NULL,
  source_id uuid REFERENCES public.news_sources(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  articles_discovered integer NOT NULL DEFAULT 0,
  articles_scanned integer NOT NULL DEFAULT 0,
  findings_created integer NOT NULL DEFAULT 0,
  error text,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_scan_runs_started ON public.news_scan_runs(started_at DESC);
ALTER TABLE public.news_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NewsScanRuns staff read" ON public.news_scan_runs FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsScanRuns staff insert" ON public.news_scan_runs FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsScanRuns staff update" ON public.news_scan_runs FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "NewsScanRuns admin delete" ON public.news_scan_runs FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'));

-- Seed sources
INSERT INTO public.news_sources (slug, name, base_url, sitemap_url) VALUES
  ('timesofmalta','Times of Malta','https://timesofmalta.com','https://timesofmalta.com/sitemap.xml'),
  ('independent','The Malta Independent','https://www.independent.com.mt','https://www.independent.com.mt/sitemap.xml'),
  ('maltatoday','MaltaToday','https://www.maltatoday.com.mt','https://www.maltatoday.com.mt/sitemap.xml'),
  ('lovinmalta','Lovin Malta','https://lovinmalta.com','https://lovinmalta.com/sitemap.xml'),
  ('newsbook','Newsbook','https://newsbook.com.mt','https://newsbook.com.mt/sitemap.xml');
