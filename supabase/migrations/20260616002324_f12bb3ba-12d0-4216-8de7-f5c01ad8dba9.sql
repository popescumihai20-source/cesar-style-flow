
-- 1. Restricționare coloane sensibile din employees
-- Păstrăm SELECT pentru roluri (necesar la app), dar excludem pin_login și removal_pin
REVOKE SELECT ON public.employees FROM anon;
REVOKE SELECT ON public.employees FROM authenticated;

GRANT SELECT (id, name, role, employee_card_code, user_id, active, created_at, updated_at)
  ON public.employees TO anon;
GRANT SELECT (id, name, role, employee_card_code, user_id, active, created_at, updated_at)
  ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

-- 2. system_settings: doar service_role poate citi (frontend folosește edge function)
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Anon can read settings" ON public.system_settings;

REVOKE SELECT ON public.system_settings FROM anon;
REVOKE SELECT ON public.system_settings FROM authenticated;
GRANT ALL ON public.system_settings TO service_role;

CREATE POLICY "Service role manages settings"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Storage product-images: permite acces prin URL direct (bucket public),
-- dar elimină policy-ul de listare a tuturor obiectelor
DROP POLICY IF EXISTS "Imagini produse publice" ON storage.objects;
-- Nu adăugăm o nouă policy SELECT — bucketul `product-images` are flag public,
-- deci CDN-ul Supabase servește fișierele direct după URL fără a trece prin RLS.
-- Listarea (storage.objects SELECT) este acum blocată pentru clienți anonimi.

-- 4. Revoc EXECUTE pe SECURITY DEFINER functions de la anon (păstrăm authenticated pentru RLS)
REVOKE EXECUTE ON FUNCTION public.get_admin_kpis() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
