CREATE TABLE public.elcom_results_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  district_number integer NOT NULL,
  count_range integer NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, district_number, count_range)
);

GRANT SELECT ON public.elcom_results_cache TO anon;
GRANT SELECT ON public.elcom_results_cache TO authenticated;
GRANT ALL ON public.elcom_results_cache TO service_role;

ALTER TABLE public.elcom_results_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ELCOM cache readable by everyone"
ON public.elcom_results_cache
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage ELCOM cache"
ON public.elcom_results_cache
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_elcom_results_cache_updated_at
BEFORE UPDATE ON public.elcom_results_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_elcom_results_cache_lookup ON public.elcom_results_cache (year, district_number, count_range);