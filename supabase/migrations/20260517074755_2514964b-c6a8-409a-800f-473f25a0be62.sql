
CREATE TYPE candidate_suggestion_status AS ENUM ('pending', 'approved', 'rejected', 'superseded');

CREATE TABLE public.candidate_field_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  current_value text,
  suggested_value text NOT NULL,
  source_urls text[] NOT NULL DEFAULT '{}',
  ai_confidence text,
  ai_model text,
  ai_reason text,
  status candidate_suggestion_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cfs_candidate ON public.candidate_field_suggestions(candidate_id);
CREATE INDEX idx_cfs_status ON public.candidate_field_suggestions(status);

ALTER TABLE public.candidate_field_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CFS staff read" ON public.candidate_field_suggestions
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CFS staff insert" ON public.candidate_field_suggestions
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "CFS staff update" ON public.candidate_field_suggestions
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CFS admin delete" ON public.candidate_field_suggestions
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cfs_updated_at BEFORE UPDATE ON public.candidate_field_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.candidate_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  source_urls text[] NOT NULL DEFAULT '{}',
  suggestion_count integer NOT NULL DEFAULT 0,
  error text,
  ai_model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_cdr_candidate ON public.candidate_discovery_runs(candidate_id);

ALTER TABLE public.candidate_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CDR staff read" ON public.candidate_discovery_runs
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CDR staff insert" ON public.candidate_discovery_runs
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "CDR staff update" ON public.candidate_discovery_runs
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CDR admin delete" ON public.candidate_discovery_runs
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));
