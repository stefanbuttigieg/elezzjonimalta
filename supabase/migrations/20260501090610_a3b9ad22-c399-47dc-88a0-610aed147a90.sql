-- Custom field definitions for candidates & proposals
CREATE TYPE public.custom_field_entity AS ENUM ('candidate', 'proposal');
CREATE TYPE public.custom_field_type AS ENUM ('text', 'textarea', 'number', 'boolean', 'date', 'url', 'select');

CREATE TABLE public.custom_field_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type public.custom_field_entity NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  field_type public.custom_field_type NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  help_text text,
  required boolean NOT NULL DEFAULT false,
  public_visible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, key)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CustomFieldDefs public read"
  ON public.custom_field_definitions FOR SELECT TO public USING (true);

CREATE POLICY "CustomFieldDefs staff insert"
  ON public.custom_field_definitions FOR INSERT TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "CustomFieldDefs staff update"
  ON public.custom_field_definitions FOR UPDATE TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "CustomFieldDefs admin delete"
  ON public.custom_field_definitions FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_custom_field_definitions_updated_at
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add custom_fields jsonb storage on candidates and proposals
ALTER TABLE public.candidates ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.proposals ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;