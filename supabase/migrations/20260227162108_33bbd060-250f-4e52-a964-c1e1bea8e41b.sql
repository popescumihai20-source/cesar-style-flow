
-- Color Dictionary
CREATE TABLE public.color_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.color_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi culori" ON public.color_dictionary FOR SELECT USING (true);
CREATE POLICY "Admins pot gestiona culori insert" ON public.color_dictionary FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona culori update" ON public.color_dictionary FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona culori delete" ON public.color_dictionary FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.color_dictionary (code, name) VALUES
  ('01', 'Alb'),
  ('02', 'Negru'),
  ('05', 'Albastru'),
  ('06', 'Verde'),
  ('08', 'Mov');

-- Producator Dictionary
CREATE TABLE public.producator_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.producator_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi producatori" ON public.producator_dictionary FOR SELECT USING (true);
CREATE POLICY "Admins pot gestiona producatori insert" ON public.producator_dictionary FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona producatori update" ON public.producator_dictionary FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins pot gestiona producatori delete" ON public.producator_dictionary FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
