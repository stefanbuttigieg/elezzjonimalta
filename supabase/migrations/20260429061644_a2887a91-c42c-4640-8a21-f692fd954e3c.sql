CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'editor'::public.app_role)
  );
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_staff(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_staff(uuid) TO authenticated;

ALTER POLICY "CandidateDistricts admin delete" ON public.candidate_districts
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "CandidateDistricts staff read all" ON public.candidate_districts
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "CandidateDistricts staff update" ON public.candidate_districts
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "CandidateDistricts staff write" ON public.candidate_districts
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "Candidates admin delete" ON public.candidates
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Candidates staff read all" ON public.candidates
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Candidates staff update" ON public.candidates
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Candidates staff write" ON public.candidates
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "Districts admin delete" ON public.districts
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Districts staff read all" ON public.districts
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Districts staff update" ON public.districts
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Districts staff write" ON public.districts
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "ParliamentTerms admin delete" ON public.parliament_terms
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "ParliamentTerms staff read all" ON public.parliament_terms
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "ParliamentTerms staff update" ON public.parliament_terms
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "ParliamentTerms staff write" ON public.parliament_terms
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "Parties admin delete" ON public.parties
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Parties staff read all" ON public.parties
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Parties staff update" ON public.parties
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Parties staff write" ON public.parties
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "Profiles select own or staff" ON public.profiles
  USING ((auth.uid() = user_id) OR app_private.is_staff(auth.uid()));

ALTER POLICY "Proposals admin delete" ON public.proposals
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Proposals staff read all" ON public.proposals
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Proposals staff update" ON public.proposals
  USING (app_private.is_staff(auth.uid()));
ALTER POLICY "Proposals staff write" ON public.proposals
  WITH CHECK (app_private.is_staff(auth.uid()));

ALTER POLICY "Roles admin manage" ON public.user_roles
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Roles read own" ON public.user_roles
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));