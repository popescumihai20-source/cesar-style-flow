
-- Fix 1: Set search_path on generate_sale_internal_id
CREATE OR REPLACE FUNCTION public.generate_sale_internal_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CES-' || lpad(
    (COALESCE((SELECT COUNT(*) FROM public.sales), 0) + 1)::TEXT,
    6, '0'
  )
$$;

-- Fix 2: Restrict stock_removals INSERT to authenticated employees
DROP POLICY "Angajati pot crea scoateri" ON public.stock_removals;
CREATE POLICY "Angajati pot crea scoateri"
  ON public.stock_removals FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- Fix 3: Restrict commission_logs INSERT to cashiers/admins
DROP POLICY "Sistem poate crea loguri comisioane" ON public.commission_logs;
CREATE POLICY "Casieri si admins pot crea loguri comisioane"
  ON public.commission_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'casier') OR public.has_role(auth.uid(), 'admin')
  );
