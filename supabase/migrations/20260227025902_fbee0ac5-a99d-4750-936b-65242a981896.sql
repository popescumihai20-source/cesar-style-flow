
-- Add stock_depozit column to products
ALTER TABLE public.products ADD COLUMN stock_depozit integer NOT NULL DEFAULT 0;

-- Create stock_transfers table for transfers between locations
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) NOT NULL,
  variant_code text,
  quantity integer NOT NULL,
  direction text NOT NULL DEFAULT 'depozit_to_magazin', -- 'depozit_to_magazin' or 'magazin_to_depozit'
  employee_id uuid REFERENCES public.employees(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage transfers
CREATE POLICY "Admins pot gestiona transferuri" ON public.stock_transfers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create stock_receipt_depozit table for warehouse receipts
CREATE TABLE public.stock_receipts_depozit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_receipts_depozit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona receptii depozit" ON public.stock_receipts_depozit
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.stock_receipt_items_depozit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES public.stock_receipts_depozit(id) NOT NULL,
  product_id uuid REFERENCES public.products(id) NOT NULL,
  variant_code text,
  quantity integer NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_receipt_items_depozit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona articole receptie depozit" ON public.stock_receipt_items_depozit
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Stock removals for depozit
CREATE TABLE public.stock_removals_depozit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) NOT NULL,
  variant_code text,
  quantity integer NOT NULL,
  reason text,
  employee_id uuid REFERENCES public.employees(id) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_removals_depozit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona scoateri depozit" ON public.stock_removals_depozit
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
