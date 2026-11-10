-- Watching a saved comparison. One row per official page that is watched: a TinyFish Page Monitor
-- reads the page once a day and calls POST /hooks/monitor/<secret> with what it found. Only
-- Monitors created here, with their ids in this table, are ever read or deleted.
CREATE TABLE watches (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  -- 'waiting' (its Monitor is still to be created), 'creating' (the create call is out, claimed at
  -- `claimed_at`), 'active', 'failed' (TinyFish refused it, or could not read the page), 'unknown'
  -- (the create call's outcome is not known, so it is never sent again).
  status TEXT NOT NULL DEFAULT 'waiting',
  claimed_at TEXT,
  monitor_id TEXT,
  created_at TEXT NOT NULL,
  -- The last run TinyFish reported and what it said: 'unchanged' or 'changed'.
  last_run_at TEXT,
  last_outcome TEXT,
  -- Set when a run says the page changed: the page is read again and its items are checked again.
  -- `recheck_tries` counts the reads that failed.
  recheck_due_at TEXT,
  recheck_tries INTEGER NOT NULL DEFAULT 0,
  UNIQUE (comparison_id, url)
);
CREATE UNIQUE INDEX watches_monitor ON watches (monitor_id) WHERE monitor_id IS NOT NULL;
CREATE INDEX watches_due ON watches (recheck_due_at) WHERE recheck_due_at IS NOT NULL;

-- Monitor runs already received. A run delivered a second time does nothing.
CREATE TABLE monitor_runs (
  run_id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  outcome TEXT,
  received_at TEXT NOT NULL
);
