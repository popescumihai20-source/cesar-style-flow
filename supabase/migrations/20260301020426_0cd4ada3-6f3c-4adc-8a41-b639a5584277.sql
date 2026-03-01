
-- 1. Inventory Locations
CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('warehouse', 'store')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Oricine poate citi locatii" ON inventory_locations FOR SELECT USING (true);
CREATE POLICY "Admins pot gestiona locatii" ON inventory_locations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO inventory_locations (name, type) VALUES 
  ('Depozit Central', 'warehouse'),
  ('Magazin Ferdinand', 'store');

-- 2. Inventory Stock (source of truth per location)
CREATE TABLE inventory_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id),
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id)
);

ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Oricine poate citi stoc locatie" ON inventory_stock FOR SELECT USING (true);
CREATE POLICY "Admins pot gestiona stoc locatie" ON inventory_stock FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Casieri pot actualiza stoc locatie" ON inventory_stock FOR UPDATE USING (has_role(auth.uid(), 'casier'::app_role));
CREATE POLICY "Depozit pot gestiona stoc locatie insert" ON inventory_stock FOR INSERT WITH CHECK (has_role(auth.uid(), 'depozit'::app_role));
CREATE POLICY "Depozit pot actualiza stoc locatie" ON inventory_stock FOR UPDATE USING (has_role(auth.uid(), 'depozit'::app_role));

-- Migrate existing stock data
INSERT INTO inventory_stock (product_id, location_id, quantity)
SELECT p.id, l.id, p.stock_general
FROM products p
CROSS JOIN inventory_locations l
WHERE l.name = 'Magazin Ferdinand' AND p.stock_general > 0;

INSERT INTO inventory_stock (product_id, location_id, quantity)
SELECT p.id, l.id, p.stock_depozit
FROM products p
CROSS JOIN inventory_locations l
WHERE l.name = 'Depozit Central' AND p.stock_depozit > 0;

-- 3. Transfer Headers
CREATE TABLE transfer_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  to_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  created_by_employee_id uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  note text,
  CHECK (from_location_id != to_location_id)
);

ALTER TABLE transfer_headers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins pot gestiona transferuri header" ON transfer_headers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Depozit pot citi transferuri header" ON transfer_headers FOR SELECT USING (has_role(auth.uid(), 'depozit'::app_role));
CREATE POLICY "Depozit pot crea transferuri header" ON transfer_headers FOR INSERT WITH CHECK (has_role(auth.uid(), 'depozit'::app_role));

-- 4. Transfer Lines
CREATE TABLE transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfer_headers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transfer_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins pot gestiona linii transfer" ON transfer_lines FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Depozit pot citi linii transfer" ON transfer_lines FOR SELECT USING (has_role(auth.uid(), 'depozit'::app_role));
CREATE POLICY "Depozit pot crea linii transfer" ON transfer_lines FOR INSERT WITH CHECK (has_role(auth.uid(), 'depozit'::app_role));

-- 5. Atomic confirm_transfer function
CREATE OR REPLACE FUNCTION confirm_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header transfer_headers%ROWTYPE;
  v_line RECORD;
  v_current_qty integer;
BEGIN
  SELECT * INTO v_header FROM transfer_headers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer negăsit'; END IF;
  IF v_header.status != 'draft' THEN RAISE EXCEPTION 'Transferul nu este în status draft'; END IF;

  FOR v_line IN SELECT tl.*, p.name as product_name FROM transfer_lines tl JOIN products p ON p.id = tl.product_id WHERE tl.transfer_id = p_transfer_id LOOP
    -- Check source stock
    SELECT COALESCE(quantity, 0) INTO v_current_qty 
    FROM inventory_stock 
    WHERE product_id = v_line.product_id AND location_id = v_header.from_location_id;
    
    IF v_current_qty IS NULL OR v_current_qty < v_line.quantity THEN
      RAISE EXCEPTION 'Stoc insuficient pentru % (disponibil: %, cerut: %)', 
        v_line.product_name, COALESCE(v_current_qty, 0), v_line.quantity;
    END IF;

    -- Decrease source
    UPDATE inventory_stock 
    SET quantity = quantity - v_line.quantity, updated_at = now()
    WHERE product_id = v_line.product_id AND location_id = v_header.from_location_id;

    -- Increase destination (upsert)
    INSERT INTO inventory_stock (product_id, location_id, quantity)
    VALUES (v_line.product_id, v_header.to_location_id, v_line.quantity)
    ON CONFLICT (product_id, location_id) 
    DO UPDATE SET quantity = inventory_stock.quantity + v_line.quantity, updated_at = now();

    -- Sync back to products legacy columns
    UPDATE products SET 
      stock_general = COALESCE((
        SELECT SUM(ist.quantity) FROM inventory_stock ist 
        JOIN inventory_locations il ON il.id = ist.location_id 
        WHERE ist.product_id = v_line.product_id AND il.type = 'store'
      ), 0),
      stock_depozit = COALESCE((
        SELECT SUM(ist.quantity) FROM inventory_stock ist 
        JOIN inventory_locations il ON il.id = ist.location_id 
        WHERE ist.product_id = v_line.product_id AND il.type = 'warehouse'
      ), 0)
    WHERE id = v_line.product_id;
  END LOOP;

  UPDATE transfer_headers SET status = 'confirmed', confirmed_at = now() WHERE id = p_transfer_id;
END;
$$;
