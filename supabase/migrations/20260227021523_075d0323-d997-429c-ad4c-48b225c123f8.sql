
-- Add permissive SELECT policy on employees so POS can look up employees by card code
CREATE POLICY "Oricine poate citi angajati" ON public.employees FOR SELECT USING (true);

-- Drop the restrictive admin ALL policy and replace with specific INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins pot gestiona angajati" ON public.employees;
CREATE POLICY "Admins pot gestiona angajati insert" ON public.employees FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona angajati update" ON public.employees FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona angajati delete" ON public.employees FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
