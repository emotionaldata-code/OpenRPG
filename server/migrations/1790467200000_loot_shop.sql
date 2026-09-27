-- Up Migration
ALTER TABLE adventurers ADD COLUMN coins integer NOT NULL DEFAULT 30 CHECK (coins BETWEEN 0 AND 999999);
ALTER TABLE account_items ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999);

-- Down Migration
ALTER TABLE account_items DROP COLUMN quantity;
ALTER TABLE adventurers DROP COLUMN coins;
