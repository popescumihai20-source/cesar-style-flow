
-- Drop all existing RESTRICTIVE policies on sales
DROP POLICY IF EXISTS "Casieri pot crea vanzari" ON public.sales;
DROP POLICY IF EXISTS "Casieri pot vedea propriile vanzari" ON public.sales;
DROP POLICY IF EXISTS "Admins pot actualiza vanzari" ON public.sales;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Casieri pot crea vanzari"
ON public.sales FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Casieri pot vedea propriile vanzari"
ON public.sales FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR cashier_employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins pot actualiza vanzari"
ON public.sales FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'casier'::app_role)
);

-- Same fix for sale_items
DROP POLICY IF EXISTS "Casieri pot adauga articole" ON public.sale_items;
DROP POLICY IF EXISTS "Acces articole vanzare" ON public.sale_items;

CREATE POLICY "Casieri pot adauga articole"
ON public.sale_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Acces articole vanzare"
ON public.sale_items FOR SELECT TO authenticated
USING (
  sale_id IN (
    SELECT id FROM sales
    WHERE has_role(auth.uid(), 'admin'::app_role)
    OR cashier_employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
);

-- Fix commission_logs too
DROP POLICY IF EXISTS "Casieri pot vedea propriile comisioane" ON public.commission_logs;
DROP POLICY IF EXISTS "Casieri si admins pot crea loguri comisioane" ON public.commission_logs;

CREATE POLICY "Casieri si admins pot crea loguri comisioane"
ON public.commission_logs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Casieri pot vedea propriile comisioane"
ON public.commission_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

-- Fix sale_audit_log
DROP POLICY IF EXISTS "Admins pot citi sale audit" ON public.sale_audit_log;
DROP POLICY IF EXISTS "Authenticated pot insera sale audit" ON public.sale_audit_log;

CREATE POLICY "Authenticated pot insera sale audit"
ON public.sale_audit_log FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins pot citi sale audit"
ON public.sale_audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
