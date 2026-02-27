
-- Add pin_login column to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin_login text;

-- Add validation trigger for employee credentials
CREATE OR REPLACE FUNCTION public.validate_employee_credentials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  weak_pins text[] := ARRAY['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321'];
BEGIN
  -- Validate card_code: exactly 7 numeric digits
  IF NEW.employee_card_code !~ '^\d{7}$' THEN
    RAISE EXCEPTION 'employee_card_code must be exactly 7 numeric digits';
  END IF;

  -- Validate pin_login if provided: exactly 4 numeric digits
  IF NEW.pin_login IS NOT NULL AND NEW.pin_login !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'pin_login must be exactly 4 numeric digits';
  END IF;

  -- Validate removal_pin (pin_stock) if provided: exactly 4 numeric digits
  IF NEW.removal_pin IS NOT NULL AND NEW.removal_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'removal_pin must be exactly 4 numeric digits';
  END IF;

  -- Reject weak pins
  IF NEW.pin_login IS NOT NULL AND NEW.pin_login = ANY(weak_pins) THEN
    RAISE EXCEPTION 'pin_login is too weak';
  END IF;

  IF NEW.removal_pin IS NOT NULL AND NEW.removal_pin = ANY(weak_pins) THEN
    RAISE EXCEPTION 'removal_pin is too weak';
  END IF;

  -- pin_login must not equal removal_pin
  IF NEW.pin_login IS NOT NULL AND NEW.removal_pin IS NOT NULL AND NEW.pin_login = NEW.removal_pin THEN
    RAISE EXCEPTION 'pin_login and removal_pin must be different';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_validate_employee_credentials ON public.employees;
CREATE TRIGGER trg_validate_employee_credentials
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_employee_credentials();

-- Add unique constraint on employee_card_code
ALTER TABLE public.employees ADD CONSTRAINT employees_card_code_unique UNIQUE (employee_card_code);
