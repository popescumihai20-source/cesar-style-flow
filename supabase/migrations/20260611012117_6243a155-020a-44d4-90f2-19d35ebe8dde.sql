
-- EMPLOYEES: read-only for anon (needed for card login lookup)
GRANT SELECT ON public.employees TO anon;
DROP POLICY IF EXISTS "Anon can read employees" ON public.employees;
CREATE POLICY "Anon can read employees" ON public.employees FOR SELECT TO anon USING (true);

-- PRODUCTS: full access for anon (catalog + edits from app)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon;
DROP POLICY IF EXISTS "Anon full access products" ON public.products;
CREATE POLICY "Anon full access products" ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);

-- INVENTORY_STOCK: full access for anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock TO anon;
DROP POLICY IF EXISTS "Anon full access inventory_stock" ON public.inventory_stock;
CREATE POLICY "Anon full access inventory_stock" ON public.inventory_stock FOR ALL TO anon USING (true) WITH CHECK (true);

-- INVENTORY_LOCATIONS: read for anon
GRANT SELECT ON public.inventory_locations TO anon;
DROP POLICY IF EXISTS "Anon read inventory_locations" ON public.inventory_locations;
CREATE POLICY "Anon read inventory_locations" ON public.inventory_locations FOR SELECT TO anon USING (true);

-- SALES: full access for anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon;
DROP POLICY IF EXISTS "Anon full access sales" ON public.sales;
CREATE POLICY "Anon full access sales" ON public.sales FOR ALL TO anon USING (true) WITH CHECK (true);

-- SALE_ITEMS: full access for anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon;
DROP POLICY IF EXISTS "Anon full access sale_items" ON public.sale_items;
CREATE POLICY "Anon full access sale_items" ON public.sale_items FOR ALL TO anon USING (true) WITH CHECK (true);
