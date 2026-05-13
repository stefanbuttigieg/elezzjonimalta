
-- Role on the council
CREATE TYPE public.local_council_role AS ENUM (
  'mayor',
  'deputy_mayor',
  'councillor',
  'co_opted'
);

-- Per-candidate council terms
CREATE TABLE public.candidate_local_council_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  council_name text NOT NULL,
  locality text,
  role public.local_council_role NOT NULL DEFAULT 'councillor',
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  election_year integer,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  votes_first_count integer,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clct_candidate ON public.candidate_local_council_terms(candidate_id);
CREATE INDEX idx_clct_council ON public.candidate_local_council_terms(council_name);
CREATE INDEX idx_clct_year ON public.candidate_local_council_terms(election_year);

ALTER TABLE public.candidate_local_council_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CLCT public read published" ON public.candidate_local_council_terms
  FOR SELECT TO public USING (
    EXISTS (SELECT 1 FROM public.candidates c
            WHERE c.id = candidate_local_council_terms.candidate_id
              AND (c.status = 'published'::review_status OR c.is_incumbent = true))
  );
CREATE POLICY "CLCT staff read all" ON public.candidate_local_council_terms
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CLCT staff insert" ON public.candidate_local_council_terms
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "CLCT staff update" ON public.candidate_local_council_terms
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "CLCT admin delete" ON public.candidate_local_council_terms
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_clct_updated_at
  BEFORE UPDATE ON public.candidate_local_council_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Import runs
CREATE TABLE public.local_council_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  council_filter text,
  election_year integer,
  status text NOT NULL DEFAULT 'processing',
  stage text,
  progress integer NOT NULL DEFAULT 0,
  page_count integer,
  extracted jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  error_stack text,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.local_council_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LCImports staff read" ON public.local_council_imports
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImports staff insert" ON public.local_council_imports
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImports staff update" ON public.local_council_imports
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImports admin delete" ON public.local_council_imports
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_lc_imports_updated_at
  BEFORE UPDATE ON public.local_council_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staging rows from a scrape (await staff confirm/merge)
CREATE TYPE public.lc_import_row_status AS ENUM (
  'pending',
  'matched',
  'imported',
  'rejected',
  'duplicate'
);

CREATE TABLE public.local_council_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.local_council_imports(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  council_term_id uuid REFERENCES public.candidate_local_council_terms(id) ON DELETE SET NULL,
  council_name text NOT NULL,
  locality text,
  candidate_name text NOT NULL,
  party_name text,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  role public.local_council_role,
  election_year integer,
  votes_first_count integer,
  elected boolean,
  match_confidence numeric DEFAULT 0,
  match_notes text,
  status public.lc_import_row_status NOT NULL DEFAULT 'pending',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lcir_import ON public.local_council_import_rows(import_id);
CREATE INDEX idx_lcir_status ON public.local_council_import_rows(status);
CREATE INDEX idx_lcir_candidate ON public.local_council_import_rows(candidate_id);

ALTER TABLE public.local_council_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LCImportRows staff read" ON public.local_council_import_rows
  FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImportRows staff insert" ON public.local_council_import_rows
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImportRows staff update" ON public.local_council_import_rows
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "LCImportRows admin delete" ON public.local_council_import_rows
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_lcir_updated_at
  BEFORE UPDATE ON public.local_council_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
