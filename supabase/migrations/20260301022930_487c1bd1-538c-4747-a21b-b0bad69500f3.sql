
-- 1) Trigger: prevent negative inventory_stock quantities
CREATE OR REPLACE FUNCTION public.prevent_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Stoc insuficient. Cantitatea nu poate fi negativă (product_id=%, location_id=%, qty=%)',
      NEW.product_id, NEW.location_id, NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON inventory_stock;
CREATE TRIGGER trg_prevent_negative_stock
  BEFORE INSERT OR UPDATE ON inventory_stock
  FOR EACH ROW
  EXECUTE FUNCTION prevent_negative_stock();

-- 2) Trigger: block base_id and full_barcode changes on products (read-only after creation)
CREATE OR REPLACE FUNCTION public.protect_barcode_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.base_id IS NOT NULL AND NEW.base_id IS DISTINCT FROM OLD.base_id THEN
    RAISE EXCEPTION 'Barcode (base_id) poate fi generat doar în modulul Recepție. Modificarea nu este permisă.';
  END IF;
  IF OLD.full_barcode IS NOT NULL AND NEW.full_barcode IS DISTINCT FROM OLD.full_barcode THEN
    RAISE EXCEPTION 'Barcode (full_barcode) poate fi generat doar în modulul Recepție. Modificarea nu este permisă.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_barcode ON products;
CREATE TRIGGER trg_protect_barcode
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION protect_barcode_fields();

-- 3) Create receiving_audit_log table for receiving operations
CREATE TABLE IF NOT EXISTS public.receiving_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES stock_receipts(id),
  product_id uuid NOT NULL REFERENCES products(id),
  barcode text NOT NULL,
  base_id text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  location_name text NOT NULL,
  employee_name text,
  employee_card_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receiving_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot citi receiving audit" ON receiving_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Depozit pot citi receiving audit" ON receiving_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'depozit'::app_role));

CREATE POLICY "Authenticated pot insera receiving audit" ON receiving_audit_log
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'depozit'::app_role)
  );
