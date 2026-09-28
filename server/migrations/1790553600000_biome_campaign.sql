-- Up Migration
ALTER TABLE adventurers DROP CONSTRAINT adventurers_completed_maps_check;
-- Preserve access earned in the old forest/castle/paradise/hell/mountain campaign.
UPDATE adventurers SET completed_maps = CASE completed_maps WHEN 0 THEN 0 WHEN 1 THEN 10 WHEN 2 THEN 15 WHEN 3 THEN 25 ELSE 30 END;
ALTER TABLE adventurers ADD CONSTRAINT adventurers_completed_maps_check CHECK (completed_maps BETWEEN 0 AND 30);

-- Down Migration
ALTER TABLE adventurers DROP CONSTRAINT adventurers_completed_maps_check;
UPDATE adventurers SET completed_maps = CASE WHEN completed_maps >= 30 THEN 5 WHEN completed_maps >= 25 THEN 3 WHEN completed_maps >= 15 THEN 2 WHEN completed_maps >= 10 THEN 1 ELSE 0 END;
ALTER TABLE adventurers ADD CONSTRAINT adventurers_completed_maps_check CHECK (completed_maps BETWEEN 0 AND 5);
