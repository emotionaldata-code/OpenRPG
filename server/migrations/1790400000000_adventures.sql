-- Up Migration
CREATE TABLE adventurers (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  potions integer NOT NULL DEFAULT 3 CHECK (potions BETWEEN 0 AND 999),
  completed_maps integer NOT NULL DEFAULT 0 CHECK (completed_maps BETWEEN 0 AND 5)
);
CREATE TABLE account_items (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_id)
);
-- Receipts make a retry safe if the DB committed before the connection failed.
CREATE TABLE adventure_rewards (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);
CREATE INDEX adventure_rewards_created_at ON adventure_rewards(created_at);

-- Down Migration
DROP TABLE adventure_rewards;
DROP TABLE account_items;
DROP TABLE adventurers;
