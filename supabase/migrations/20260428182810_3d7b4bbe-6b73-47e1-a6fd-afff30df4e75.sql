
-- Roles enum + user_roles + profiles
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor')
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Status enum used by editorial entities
CREATE TYPE public.review_status AS ENUM ('draft','pending_review','published','archived');

-- Parties
CREATE TABLE public.parties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_mt TEXT,
  short_name TEXT,
  color TEXT,
  website TEXT,
  description_en TEXT,
  description_mt TEXT,
  status public.review_status NOT NULL DEFAULT 'draft',
  source_url TEXT,
  imported_from TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Districts
CREATE TABLE public.districts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_mt TEXT,
  localities_en TEXT,
  localities_mt TEXT,
  status public.review_status NOT NULL DEFAULT 'draft',
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_districts_updated BEFORE UPDATE ON public.districts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Candidates
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  primary_district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL,
  is_incumbent BOOLEAN NOT NULL DEFAULT false,
  electoral_confirmed BOOLEAN NOT NULL DEFAULT false,
  bio_en TEXT,
  bio_mt TEXT,
  photo_url TEXT,
  website TEXT,
  facebook TEXT,
  twitter TEXT,
  parlament_mt_url TEXT,
  status public.review_status NOT NULL DEFAULT 'pending_review',
  source_url TEXT,
  imported_from TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_candidates_status ON public.candidates(status);
CREATE INDEX idx_candidates_party ON public.candidates(party_id);
CREATE INDEX idx_candidates_district ON public.candidates(primary_district_id);

-- RLS POLICIES
-- profiles: users see their own; admins see all
CREATE POLICY "Profiles select own or staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "Profiles update own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- user_roles: only admins manage; users can read their own
CREATE POLICY "Roles read own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Roles admin manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- parties: published readable by all; staff full
CREATE POLICY "Parties public read published" ON public.parties
  FOR SELECT USING (status = 'published');
CREATE POLICY "Parties staff read all" ON public.parties
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Parties staff write" ON public.parties
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Parties staff update" ON public.parties
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Parties admin delete" ON public.parties
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- districts
CREATE POLICY "Districts public read published" ON public.districts
  FOR SELECT USING (status = 'published');
CREATE POLICY "Districts staff read all" ON public.districts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Districts staff write" ON public.districts
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Districts staff update" ON public.districts
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Districts admin delete" ON public.districts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- candidates
CREATE POLICY "Candidates public read published" ON public.candidates
  FOR SELECT USING (status = 'published');
CREATE POLICY "Candidates staff read all" ON public.candidates
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Candidates staff write" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Candidates staff update" ON public.candidates
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Candidates admin delete" ON public.candidates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
