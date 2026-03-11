-- Create returns table to track product returns linked to original sales
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  variant_code text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read returns"
ON public.returns FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'casier'::app_role)
);

CREATE POLICY "Casieri pot crea retururi"
ON public.returns FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authenticated users can read return_items"
ON public.return_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'casier'::app_role)
);

CREATE POLICY "Casieri pot crea return_items"
ON public.return_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'casier'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

NOTIFY pgrst, 'reload schema';