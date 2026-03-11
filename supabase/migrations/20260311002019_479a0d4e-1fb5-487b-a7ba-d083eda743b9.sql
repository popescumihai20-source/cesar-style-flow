
-- Force PostgREST schema cache reload so new PERMISSIVE policies take effect
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
