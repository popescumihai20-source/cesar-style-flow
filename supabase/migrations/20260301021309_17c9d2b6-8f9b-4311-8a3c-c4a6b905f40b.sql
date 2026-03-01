
-- Transfer audit log table
CREATE TABLE transfer_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfer_headers(id),
  from_location_name text NOT NULL,
  to_location_name text NOT NULL,
  product_base_id text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  employee_name text,
  employee_card_code text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transfer_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins pot citi audit log" ON transfer_audit_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System pot insera audit log" ON transfer_audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Depozit pot citi audit log" ON transfer_audit_log FOR SELECT USING (has_role(auth.uid(), 'depozit'::app_role));

-- Update confirm_transfer to also write audit log
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
  v_from_name text;
  v_to_name text;
  v_emp_name text;
  v_emp_card text;
  v_note text;
BEGIN
  SELECT * INTO v_header FROM transfer_headers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer negăsit'; END IF;
  IF v_header.status != 'draft' THEN RAISE EXCEPTION 'Transferul nu este în status draft'; END IF;

  -- Get location names
  SELECT name INTO v_from_name FROM inventory_locations WHERE id = v_header.from_location_id;
  SELECT name INTO v_to_name FROM inventory_locations WHERE id = v_header.to_location_id;
  
  -- Get employee info
  IF v_header.created_by_employee_id IS NOT NULL THEN
    SELECT name, employee_card_code INTO v_emp_name, v_emp_card 
    FROM employees WHERE id = v_header.created_by_employee_id;
  END IF;

  v_note := v_header.note;

  FOR v_line IN SELECT tl.*, p.name as product_name, p.base_id as product_base_id 
    FROM transfer_lines tl JOIN products p ON p.id = tl.product_id 
    WHERE tl.transfer_id = p_transfer_id LOOP
    
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

    -- Write audit log
    INSERT INTO transfer_audit_log (
      transfer_id, from_location_name, to_location_name,
      product_base_id, product_name, quantity,
      employee_name, employee_card_code, note
    ) VALUES (
      p_transfer_id, v_from_name, v_to_name,
      v_line.product_base_id, v_line.product_name, v_line.quantity,
      v_emp_name, v_emp_card, v_note
    );
  END LOOP;

  UPDATE transfer_headers SET status = 'confirmed', confirmed_at = now() WHERE id = p_transfer_id;
END;
$$;

-- Create sale_audit_log for POS sales
CREATE TABLE sale_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  location_name text NOT NULL,
  employee_name text,
  employee_card_code text,
  product_base_id text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sale_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins pot citi sale audit" ON sale_audit_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System pot insera sale audit" ON sale_audit_log FOR INSERT WITH CHECK (true);
