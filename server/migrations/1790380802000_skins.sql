-- Up Migration
CREATE TABLE skins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 32),
  character_class text NOT NULL CHECK (character_class IN ('archer', 'mage', 'warrior')),
  template_version integer NOT NULL CHECK (template_version = 1),
  artwork jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skins_account_idx ON skins(account_id, created_at);

-- Down Migration
DROP TABLE skins;
