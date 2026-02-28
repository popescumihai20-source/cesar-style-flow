-- First remove any duplicate base_id rows keeping only the first
DELETE FROM products a USING products b WHERE a.id > b.id AND a.base_id = b.base_id;

-- Add unique constraint on base_id to prevent duplicates
ALTER TABLE products ADD CONSTRAINT products_base_id_unique UNIQUE (base_id);