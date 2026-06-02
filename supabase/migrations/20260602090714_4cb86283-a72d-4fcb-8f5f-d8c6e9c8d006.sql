CREATE TABLE public.casual_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  election_year INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  district_number INTEGER NOT NULL,
  scenario JSONB NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT casual_predictions_unique UNIQUE (election_year, full_name, district_number)
);

GRANT SELECT ON public.casual_predictions TO anon;
GRANT SELECT ON public.casual_predictions TO authenticated;
GRANT ALL ON public.casual_predictions TO service_role;

ALTER TABLE public.casual_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CasualPredictions public read"
ON public.casual_predictions
FOR SELECT
USING (true);

CREATE POLICY "CasualPredictions staff write"
ON public.casual_predictions
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CasualPredictions staff update"
ON public.casual_predictions
FOR UPDATE
TO authenticated
USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CasualPredictions admin delete"
ON public.casual_predictions
FOR DELETE
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_casual_predictions_lookup
  ON public.casual_predictions (election_year, full_name, district_number);
