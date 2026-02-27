
CREATE TABLE public.articol_dictionary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.articol_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oricine poate citi articole" ON public.articol_dictionary
  FOR SELECT USING (true);

CREATE POLICY "Admins pot gestiona articole" ON public.articol_dictionary
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins pot actualiza articole" ON public.articol_dictionary
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins pot sterge articole" ON public.articol_dictionary
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.articol_dictionary (code, name) VALUES
  ('10', 'Costum'),
  ('11', 'Sacou'),
  ('12', 'Pantalon'),
  ('13', 'Camasa'),
  ('51', 'Pulover');
