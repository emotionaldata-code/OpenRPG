-- Up Migration
ALTER TABLE accounts DROP COLUMN character_class;

-- Down Migration
-- Previous selections were intentionally discarded; restored accounts default to Archer.
ALTER TABLE accounts ADD COLUMN character_class text NOT NULL DEFAULT 'archer'
  CHECK (character_class IN ('archer', 'mage', 'warrior'));
ALTER TABLE accounts ALTER COLUMN character_class DROP DEFAULT;
