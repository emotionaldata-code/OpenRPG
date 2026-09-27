-- Up Migration
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(18) NOT NULL CHECK (username ~ '^[A-Za-z0-9_-]{3,18}$'),
  password_hash text NOT NULL,
  character_class text NOT NULL CHECK (character_class IN ('archer', 'mage', 'warrior')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_username_unique ON accounts (lower(username));
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account_id ON sessions(account_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

-- Down Migration
DROP TABLE sessions;
DROP TABLE accounts;
