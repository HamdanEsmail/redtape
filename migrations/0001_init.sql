-- Redtape: the first schema. Times are ISO 8601 UTC strings; dates are YYYY-MM-DD.

-- One founder's comparison. `state` moves queued -> finding -> researching -> checking -> ready,
-- or to failed. `advance` (src/compare/advance.ts) moves it a little at a time and is safe to call twice.
CREATE TABLE comparisons (
  id TEXT PRIMARY KEY,
  activity TEXT NOT NULL,
  -- The three places as the visitor typed them, a JSON array of three strings.
  places_json TEXT NOT NULL,
  -- The activity and the three places normalised (order ignored): the same key within 7 days opens
  -- the stored comparison.
  reuse_key TEXT NOT NULL,
  -- 'public' (the form or the public API), 'admin' (the admin route) or 'import' (an adopted run).
  origin TEXT NOT NULL,
  -- 1 when this comparison is kept (the saved demos); public ones expire.
  kept INTEGER NOT NULL DEFAULT 0,
  -- 1 to 3 for the demo comparisons (1 is featured on the home), else NULL.
  demo INTEGER,
  state TEXT NOT NULL DEFAULT 'queued',
  -- Why a failed comparison did not finish, in Redtape's own words (never upstream text).
  failed_reason TEXT,
  -- The TinyResearch run. Stored as soon as the start answers, before the first poll, so a retry
  -- never starts a second run.
  research_run_id TEXT,
  -- When the research run was started (the 25-minute clock).
  research_started_at TEXT,
  -- The wallet before the run started and after it ended; the difference is the comparison's cost.
  wallet_before_usd REAL,
  wallet_after_usd REAL,
  cost_usd REAL,
  -- 'wallet' (the difference above), 'free' (the day's free runs), 'import' (an adopted run).
  cost_basis TEXT,
  -- When the run's cost was booked, and when a later wallet read corrected it.
  run_booked_at TEXT,
  cost_settled_at TEXT,
  -- Items dropped because their heading could not be read.
  dropped_items INTEGER NOT NULL DEFAULT 0,
  -- How many official pages the research run cited (evidence length).
  sources_count INTEGER,
  categories_json TEXT,
  verdict_json TEXT,
  unclear_json TEXT,
  figures_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  -- A public comparison is deleted with its items after this time; NULL keeps it.
  expires_at TEXT,
  -- Salted hash of the visitor's address; the address itself is never stored.
  visitor_hash TEXT
);
CREATE INDEX comparisons_reuse ON comparisons (reuse_key, created_at);
CREATE INDEX comparisons_state ON comparisons (state, created_at);

-- One licence, permit, registration or filing for one place in one comparison.
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  -- 0, 1 or 2: the place's position in the asked list.
  place_index INTEGER NOT NULL,
  category_n INTEGER NOT NULL,
  name TEXT NOT NULL,
  required TEXT NOT NULL DEFAULT '',
  authority TEXT NOT NULL DEFAULT '',
  fee TEXT NOT NULL DEFAULT '',
  time_to TEXT NOT NULL DEFAULT '',
  renewal TEXT NOT NULL DEFAULT '',
  ongoing TEXT NOT NULL DEFAULT '',
  url TEXT,
  host TEXT,
  quote TEXT NOT NULL DEFAULT '',
  -- 'unchecked', 'checking' (claimed at `claimed_at`), or 'done'.
  check_state TEXT NOT NULL DEFAULT 'unchecked',
  claimed_at TEXT,
  -- 'found', 'found_fee_missing', 'quote_missing', 'unreadable', 'no_url'.
  check_kind TEXT,
  checked_at TEXT,
  -- How many times this item's page has been read.
  read_attempts INTEGER NOT NULL DEFAULT 0,
  retry_at TEXT,
  -- A possible fee page on the same host, for a gap in a fee (JSON {title, url}); never a number
  -- for the grid.
  fee_lead_json TEXT
);
CREATE INDEX items_state ON items (comparison_id, check_state);

-- Preferred official hosts found for a place before the research run, at most 6 per place.
CREATE TABLE place_sites (
  comparison_id TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  place_index INTEGER NOT NULL,
  host TEXT NOT NULL,
  PRIMARY KEY (comparison_id, place_index, host)
);

-- The spend ledger: one row per TinyFish call (free calls at $0), plus one row per finished
-- TinyResearch run with what it cost.
CREATE TABLE spend (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  ref TEXT,
  at TEXT NOT NULL
);
CREATE INDEX spend_kind ON spend (kind);

-- Daily counters behind the public limits. One row per (visitor hash, UTC day); the row with
-- ip_hash 'all' counts every public comparison that day.
CREATE TABLE public_use (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);

-- The one comparison allowed to run a TinyResearch at a time. One row, always present.
CREATE TABLE run_slot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  comparison_id TEXT,
  since TEXT
);
INSERT INTO run_slot (id) VALUES (1);
