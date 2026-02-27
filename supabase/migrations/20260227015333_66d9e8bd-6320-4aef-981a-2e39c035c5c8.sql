
-- =============================================
-- Sistemul Retail Cesar's — Schema Bază de Date
-- =============================================

-- Enum-uri pentru roluri și statusuri
CREATE TYPE public.app_role AS ENUM ('admin', 'casier', 'depozit');
CREATE TYPE public.sale_status AS ENUM ('pending_fiscal', 'fiscalizat', 'anulat');
CREATE TYPE public.payment_method AS ENUM ('numerar', 'card', 'mixt');
CREATE TYPE public.seasonal_tag AS ENUM ('permanent', 'iarna', 'vara', 'tranzitie');

-- Funcție update timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabel roluri utilizatori (securitate)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Funcție securitate verificare rol (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Politici user_roles
CREATE POLICY "Admins pot vedea toate rolurile"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins pot gestiona rolurile"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot actualiza rolurile"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge rolurile"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel angajați
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  employee_card_code TEXT UNIQUE NOT NULL,
  removal_pin TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins pot gestiona angajati"
  ON public.employees FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Angajatii isi pot vedea propriul profil"
  ON public.employees FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Tabel dispozitive
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL,
  allowed_roles app_role[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona dispozitive"
  ON public.devices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Oricine autentificat poate citi dispozitive"
  ON public.devices FOR SELECT
  TO authenticated
  USING (true);

-- Tabel produse
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_general INTEGER NOT NULL DEFAULT 0,
  seasonal_tag seasonal_tag NOT NULL DEFAULT 'permanent',
  active BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_products_base_id ON public.products(base_id);
CREATE INDEX idx_products_name_search ON public.products USING gin(to_tsvector('simple', name));
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_active ON public.products(active);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Oricine poate citi produsele"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "Admins pot gestiona produse"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot actualiza produse"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge produse"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel variante produs
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_code TEXT NOT NULL,
  label TEXT NOT NULL,
  stock_variant INTEGER NOT NULL DEFAULT 0,
  image_override TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, variant_code)
);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi variantele"
  ON public.product_variants FOR SELECT
  USING (true);

CREATE POLICY "Admins pot gestiona variante"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot actualiza variante"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge variante"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel vânzări
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id TEXT UNIQUE NOT NULL,
  cashier_employee_id UUID REFERENCES public.employees(id),
  status sale_status NOT NULL DEFAULT 'pending_fiscal',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'numerar',
  cash_amount NUMERIC(10,2),
  card_amount NUMERIC(10,2),
  fiscal_receipt_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sales_internal_id ON public.sales(internal_id);
CREATE INDEX idx_sales_created_at ON public.sales(created_at);
CREATE INDEX idx_sales_status ON public.sales(status);

CREATE POLICY "Casieri pot crea vanzari"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'casier') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Casieri pot vedea propriile vanzari"
  ON public.sales FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR cashier_employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins pot actualiza vanzari"
  ON public.sales FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'casier'));

-- Tabel articole vânzare
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_gift BOOLEAN NOT NULL DEFAULT false,
  line_total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acces articole vanzare"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM public.sales
      WHERE public.has_role(auth.uid(), 'admin')
        OR cashier_employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Casieri pot adauga articole"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'casier') OR public.has_role(auth.uid(), 'admin'));

-- Tabel scoateri stoc
CREATE TABLE public.stock_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_code TEXT,
  quantity INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_removals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Angajati pot crea scoateri"
  ON public.stock_removals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins pot vedea toate scoaterile"
  ON public.stock_removals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel config coduri de bare
CREATE TABLE public.barcode_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_version TEXT NOT NULL,
  date_format TEXT NOT NULL DEFAULT 'DDMMYY',
  active_lengths INTEGER[] NOT NULL DEFAULT '{17, 19}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.barcode_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi config"
  ON public.barcode_config FOR SELECT
  USING (true);

CREATE POLICY "Admins pot modifica config"
  ON public.barcode_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.barcode_config (format_version, date_format, active_lengths)
VALUES ('v2', 'DDMMYY', '{17, 19}');

-- Tabel buline (comisioane)
CREATE TABLE public.bulina_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_name TEXT NOT NULL,
  hex_color TEXT NOT NULL,
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bulina_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi buline"
  ON public.bulina_commissions FOR SELECT
  USING (true);

CREATE POLICY "Admins pot gestiona buline"
  ON public.bulina_commissions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot actualiza buline"
  ON public.bulina_commissions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge buline"
  ON public.bulina_commissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel atribuiri buline la produse
CREATE TABLE public.product_bulina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  bulina_id UUID NOT NULL REFERENCES public.bulina_commissions(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);
ALTER TABLE public.product_bulina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi atribuiri buline"
  ON public.product_bulina FOR SELECT
  USING (true);

CREATE POLICY "Admins pot gestiona atribuiri"
  ON public.product_bulina FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot actualiza atribuiri"
  ON public.product_bulina FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge atribuiri"
  ON public.product_bulina FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel log comisioane
CREATE TABLE public.commission_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  amount NUMERIC(10,2) NOT NULL,
  bulina_id UUID REFERENCES public.bulina_commissions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casieri pot vedea propriile comisioane"
  ON public.commission_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Sistem poate crea loguri comisioane"
  ON public.commission_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Tabel clienți
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  card_barcode TEXT UNIQUE,
  points INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Autentificati pot citi clienti"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins si casieri pot gestiona clienti"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'casier'));

CREATE POLICY "Admins pot actualiza clienti"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel target-uri
CREATE TABLE public.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  target_value NUMERIC(10,2) NOT NULL,
  period TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pot gestiona target-uri"
  ON public.targets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabel recepții marfă
CREATE TABLE public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins si depozit pot vedea receptii"
  ON public.stock_receipts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'depozit'));

CREATE POLICY "Admins si depozit pot crea receptii"
  ON public.stock_receipts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'depozit'));

CREATE TABLE public.stock_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_code TEXT,
  quantity INTEGER NOT NULL,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins si depozit pot vedea articole receptie"
  ON public.stock_receipt_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'depozit'));

CREATE POLICY "Admins si depozit pot crea articole receptie"
  ON public.stock_receipt_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'depozit'));

-- Funcție generare ID intern vânzare
CREATE OR REPLACE FUNCTION public.generate_sale_internal_id()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'CES-' || lpad(
    (COALESCE((SELECT COUNT(*) FROM public.sales), 0) + 1)::TEXT,
    6, '0'
  )
$$;

-- Storage bucket pentru imagini produse
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

CREATE POLICY "Imagini produse publice"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Admins pot uploada imagini"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pot sterge imagini"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
