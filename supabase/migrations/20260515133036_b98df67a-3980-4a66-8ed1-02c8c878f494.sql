CREATE TABLE public.translation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang text NOT NULL CHECK (lang IN ('en','mt')),
  key text NOT NULL,
  value text NOT NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE(lang, key)
);

ALTER TABLE public.translation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Translation overrides are public read"
  ON public.translation_overrides FOR SELECT USING (true);

CREATE POLICY "Staff can insert translation overrides"
  ON public.translation_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update translation overrides"
  ON public.translation_overrides FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete translation overrides"
  ON public.translation_overrides FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX idx_translation_overrides_lang_key ON public.translation_overrides(lang, key);

CREATE TRIGGER update_translation_overrides_updated_at
  BEFORE UPDATE ON public.translation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();