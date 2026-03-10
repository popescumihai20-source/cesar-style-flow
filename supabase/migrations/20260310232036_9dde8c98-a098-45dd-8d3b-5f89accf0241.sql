
-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Casieri pot crea vanzari" ON public.sales;

-- Recreate as PERMISSIVE
CREATE POLICY "Casieri pot crea vanzari"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Also fix SELECT policy (also restrictive)
DROP POLICY IF EXISTS "Casieri pot vedea propriile vanzari" ON public.sales;
CREATE POLICY "Casieri pot vedea propriile vanzari"
ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR (cashier_employee_id IN (
    SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()
  ))
);

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Admins pot actualiza vanzari" ON public.sales;
CREATE POLICY "Admins pot actualiza vanzari"
ON public.sales
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'casier'::app_role)
);

-- Fix sale_items INSERT policy too
DROP POLICY IF EXISTS "Casieri pot adauga articole" ON public.sale_items;
CREATE POLICY "Casieri pot adauga articole"
ON public.sale_items
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix sale_items SELECT policy
DROP POLICY IF EXISTS "Acces articole vanzare" ON public.sale_items;
CREATE POLICY "Acces articole vanzare"
ON public.sale_items
FOR SELECT
TO authenticated
USING (
  sale_id IN (
    SELECT sales.id FROM sales
    WHERE has_role(auth.uid(), 'admin'::app_role)
    OR sales.cashier_employee_id IN (
      SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()
    )
  )
);
