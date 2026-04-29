CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS public.app_role[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role ORDER BY role), ARRAY[]::public.app_role[])
  FROM public.user_roles
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM authenticated;