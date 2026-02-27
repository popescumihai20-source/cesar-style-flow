
-- Drop old trigger first
DROP TRIGGER IF EXISTS trg_validate_employee_credentials ON public.employees;

-- Add role column to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'casier';

-- Make pin_login and removal_pin NOT NULL with a temp default
ALTER TABLE public.employees ALTER COLUMN pin_login SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN pin_login SET DEFAULT '0000';
ALTER TABLE public.employees ALTER COLUMN removal_pin SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN removal_pin SET DEFAULT '0000';

-- Remove defaults after (they'll be set by app)
ALTER TABLE public.employees ALTER COLUMN pin_login DROP DEFAULT;
ALTER TABLE public.employees ALTER COLUMN removal_pin DROP DEFAULT;

-- Recreate validation trigger with role check
CREATE OR REPLACE FUNCTION public.validate_employee_credentials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  weak_pins text[] := ARRAY['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321'];
BEGIN
  -- Validate role
  IF NEW.role NOT IN ('admin', 'casier') THEN
    RAISE EXCEPTION 'role must be admin or casier';
  END IF;

  -- Validate card_code: exactly 7 numeric digits
  IF NEW.employee_card_code !~ '^\d{7}$' THEN
    RAISE EXCEPTION 'employee_card_code must be exactly 7 numeric digits';
  END IF;

  -- Admin card must start with 9
  IF NEW.role = 'admin' AND LEFT(NEW.employee_card_code, 1) != '9' THEN
    RAISE EXCEPTION 'Admin card_code must start with 9';
  END IF;

  -- Casier card must start with 1
  IF NEW.role = 'casier' AND LEFT(NEW.employee_card_code, 1) != '1' THEN
    RAISE EXCEPTION 'Casier card_code must start with 1';
  END IF;

  -- Validate pin_login: exactly 4 numeric digits
  IF NEW.pin_login !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'pin_login must be exactly 4 numeric digits';
  END IF;

  -- Validate removal_pin: exactly 4 numeric digits
  IF NEW.removal_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'removal_pin must be exactly 4 numeric digits';
  END IF;

  -- Reject weak pins
  IF NEW.pin_login = ANY(weak_pins) THEN
    RAISE EXCEPTION 'pin_login is too weak';
  END IF;
  IF NEW.removal_pin = ANY(weak_pins) THEN
    RAISE EXCEPTION 'removal_pin is too weak';
  END IF;

  -- pin_login must not equal removal_pin
  IF NEW.pin_login = NEW.removal_pin THEN
    RAISE EXCEPTION 'pin_login and removal_pin must be different';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_employee_credentials
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_employee_credentials();
