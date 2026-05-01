-- Admin-managed disclaimer banners shown across the site
CREATE TABLE public.site_disclaimers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'warning',
  is_active BOOLEAN NOT NULL DEFAULT true,
  placement TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_disclaimers ENABLE ROW LEVEL SECURITY;

-- Public read (only active rows are useful, but we keep filtering in app + below)
CREATE POLICY "Anyone can read disclaimers"
  ON public.site_disclaimers FOR SELECT
  USING (true);

-- Admin/editor write access (split policies, no broad ALL)
CREATE POLICY "Staff can insert disclaimers"
  ON public.site_disclaimers FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );

CREATE POLICY "Staff can update disclaimers"
  ON public.site_disclaimers FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );

CREATE POLICY "Staff can delete disclaimers"
  ON public.site_disclaimers FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );

-- updated_at trigger (reuse existing helper if present, otherwise create)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_site_disclaimers_updated_at
  BEFORE UPDATE ON public.site_disclaimers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();