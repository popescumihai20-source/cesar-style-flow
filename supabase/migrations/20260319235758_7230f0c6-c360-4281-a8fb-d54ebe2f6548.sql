CREATE TABLE IF NOT EXISTS public.inventory_import_debug_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  run_id uuid NOT NULL,
  import_source text NOT NULL,
  location_id uuid NULL REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  location_name text NOT NULL,
  stable_key text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  source_line_number integer NULL,
  source_barcode text NOT NULL,
  matched_db_barcode text NULL,
  extracted_price_from_source integer NULL,
  extracted_price_from_db integer NULL,
  quantity integer NOT NULL DEFAULT 0,
  line_value numeric NOT NULL DEFAULT 0,
  mismatch_flag boolean NOT NULL DEFAULT false,
  mismatch_reason text NULL,
  CONSTRAINT inventory_import_debug_lines_source_chk CHECK (import_source IN ('initial-stock-load', 'bulk-import-inventory'))
);

ALTER TABLE public.inventory_import_debug_lines ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inventory_import_debug_lines_run_id
  ON public.inventory_import_debug_lines(run_id);

CREATE INDEX IF NOT EXISTS idx_inventory_import_debug_lines_created_at
  ON public.inventory_import_debug_lines(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_import_debug_lines_mismatch
  ON public.inventory_import_debug_lines(mismatch_flag);

CREATE INDEX IF NOT EXISTS idx_inventory_import_debug_lines_location
  ON public.inventory_import_debug_lines(location_id);

DROP POLICY IF EXISTS "Admins and depozit can read import debug lines" ON public.inventory_import_debug_lines;
CREATE POLICY "Admins and depozit can read import debug lines"
ON public.inventory_import_debug_lines
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'depozit'::app_role));