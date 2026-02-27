
-- Inventory sessions table
CREATE TABLE public.inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL CHECK (location IN ('magazin', 'depozit')),
  started_by uuid REFERENCES public.employees(id) NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona inventarieri" ON public.inventory_sessions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Inventory lines table
CREATE TABLE public.inventory_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.inventory_sessions(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) NOT NULL,
  variant_code text,
  system_quantity integer NOT NULL DEFAULT 0,
  counted_quantity integer NOT NULL DEFAULT 0,
  difference integer GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  adjustment_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, product_id, variant_code)
);

ALTER TABLE public.inventory_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona linii inventar" ON public.inventory_lines
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Inventory audit log
CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.inventory_sessions(id) NOT NULL,
  product_id uuid REFERENCES public.products(id) NOT NULL,
  variant_code text,
  location text NOT NULL,
  old_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  difference integer NOT NULL,
  reason text NOT NULL,
  adjusted_by uuid REFERENCES public.employees(id) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona ajustari" ON public.inventory_adjustments
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for quick open session lookup
CREATE INDEX idx_inventory_sessions_status ON public.inventory_sessions(status, location);
