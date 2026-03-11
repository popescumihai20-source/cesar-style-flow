-- Fix SELECT policy on sales to allow casier role to see their sales
DROP POLICY IF EXISTS "Casieri pot vedea propriile vanzari" ON public.sales;

CREATE POLICY "Casieri pot vedea propriile vanzari"
ON public.sales FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'casier'::app_role)
);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';