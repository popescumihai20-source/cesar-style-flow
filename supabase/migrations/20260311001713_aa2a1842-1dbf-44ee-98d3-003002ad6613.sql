
-- Fix: ALL policies on sales, sale_items, commission_logs, sale_audit_log
-- are RESTRICTIVE (Permissive: No). PostgreSQL needs at least one PERMISSIVE
-- policy to grant access. RESTRICTIVE-only = always denied.

-- ========== SALES ==========
DROP POLICY IF EXISTS "Casieri pot crea vanzari" ON public.sales;
DROP POLICY IF EXISTS "Casieri pot vedea propriile vanzari" ON public.sales;
DROP POLICY IF EXISTS "Admins pot actualiza vanzari" ON public.sales;

CREATE POLICY "Casieri pot crea vanzari"
ON public.sales FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Casieri pot vedea propriile vanzari"
ON public.sales FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  cashier_employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admins pot actualiza vanzari"
ON public.sales FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'casier'::app_role)
);

-- ========== SALE_ITEMS ==========
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
  has_role(auth.uid(), 'admin'::app_role) OR
  sale_id IN (
    SELECT id FROM sales WHERE cashier_employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
);

-- ========== COMMISSION_LOGS ==========
DROP POLICY IF EXISTS "Casieri si admins pot crea loguri comisioane" ON public.commission_logs;
DROP POLICY IF EXISTS "Casieri pot vedea propriile comisioane" ON public.commission_logs;

CREATE POLICY "Casieri si admins pot crea loguri comisioane"
ON public.commission_logs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Casieri pot vedea propriile comisioane"
ON public.commission_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
);

-- ========== SALE_AUDIT_LOG ==========
DROP POLICY IF EXISTS "Authenticated pot insera sale audit" ON public.sale_audit_log;
DROP POLICY IF EXISTS "Admins pot citi sale audit" ON public.sale_audit_log;

CREATE POLICY "Authenticated pot insera sale audit"
ON public.sale_audit_log FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins pot citi sale audit"
ON public.sale_audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ========== PRODUCTS UPDATE for cashiers (stock decrement) ==========
DROP POLICY IF EXISTS "Casieri pot actualiza stoc produse" ON public.products;

CREATE POLICY "Casieri pot actualiza stoc produse"
ON public.products FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'casier'::app_role)
);

-- ========== INVENTORY_STOCK INSERT for cashiers ==========
DROP POLICY IF EXISTS "Casieri pot insera stoc locatie" ON public.inventory_stock;

CREATE POLICY "Casieri pot insera stoc locatie"
ON public.inventory_stock FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role)
);
