-- Patrons (institutional supporters shown on /supporters)
CREATE TABLE public.patrons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  website text,
  disclosure_note text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patrons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patrons public read published"
  ON public.patrons FOR SELECT
  TO public
  USING (published = true);

CREATE POLICY "Patrons staff read all"
  ON public.patrons FOR SELECT
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "Patrons staff insert"
  ON public.patrons FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "Patrons staff update"
  ON public.patrons FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "Patrons admin delete"
  ON public.patrons FOR DELETE
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER patrons_set_updated_at
  BEFORE UPDATE ON public.patrons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX patrons_sort_idx ON public.patrons (published, sort_order);


-- Public donations (opt-in named individual supporters)
CREATE TABLE public.public_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  message text,
  kind text NOT NULL DEFAULT 'one_off' CHECK (kind IN ('one_off', 'monthly')),
  amount_eur numeric(10,2),
  show_publicly boolean NOT NULL DEFAULT true,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public donations public read visible"
  ON public.public_donations FOR SELECT
  TO public
  USING (show_publicly = true);

CREATE POLICY "Public donations staff read all"
  ON public.public_donations FOR SELECT
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "Public donations staff insert"
  ON public.public_donations FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "Public donations staff update"
  ON public.public_donations FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "Public donations admin delete"
  ON public.public_donations FOR DELETE
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER public_donations_set_updated_at
  BEFORE UPDATE ON public.public_donations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX public_donations_created_idx ON public.public_donations (created_at DESC);


-- Site finance (single row for monthly cost transparency)
CREATE TABLE public.site_finance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  monthly_cost_eur numeric(10,2) NOT NULL DEFAULT 75,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.site_finance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site finance public read"
  ON public.site_finance FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Site finance staff insert"
  ON public.site_finance FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "Site finance staff update"
  ON public.site_finance FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE TRIGGER site_finance_set_updated_at
  BEFORE UPDATE ON public.site_finance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_finance (singleton, monthly_cost_eur, currency, notes)
VALUES (true, 75, 'EUR', 'Estimated monthly hosting + Lovable Cloud + AI categorisation costs');