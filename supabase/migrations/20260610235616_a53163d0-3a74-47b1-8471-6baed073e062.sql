
-- 1. Add code column to inventory_locations (stable identifier across renames)
ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS code text;

-- 2. Wipe all current stock data and reset legacy columns
DELETE FROM public.inventory_stock;
UPDATE public.products SET stock_general = 0, stock_depozit = 0;

-- 3. Deactivate any pre-existing locations to avoid confusion
UPDATE public.inventory_locations SET active = false WHERE code IS NULL OR code NOT IN ('FERDINAND','TEI','DEPOZIT');

-- 4. Insert the 3 canonical locations (idempotent by code)
INSERT INTO public.inventory_locations (name, type, code, active) VALUES
  ('Cesar''s Ferdinand', 'store', 'FERDINAND', true),
  ('Cesar''s Tei',       'store', 'TEI',       true),
  ('Depozit Central',    'warehouse', 'DEPOZIT', true)
ON CONFLICT DO NOTHING;

-- 5. Ensure uniqueness on code going forward
CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_code_key
  ON public.inventory_locations(code) WHERE code IS NOT NULL;
