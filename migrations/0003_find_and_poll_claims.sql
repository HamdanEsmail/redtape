-- When the finding searches were claimed, and when the research run was last read.
-- A finding claim older than a few minutes may be taken again. A poll is claimed only
-- when the last one is at least 55 seconds old, so the run is read once a minute.
ALTER TABLE comparisons ADD COLUMN finding_claimed_at TEXT;
ALTER TABLE comparisons ADD COLUMN research_polled_at TEXT;
