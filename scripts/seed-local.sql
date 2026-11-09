-- Invented comparisons for a local D1. Fictional places, authorities and .gov.example pages.
-- Load after migrations: wrangler d1 execute DB --local --file scripts/seed-local.sql

DELETE FROM items;
DELETE FROM place_sites;
DELETE FROM spend WHERE id LIKE 'spd%';
DELETE FROM comparisons WHERE id IN ('demoready001', 'democheck001', 'demoresrch01', 'demofailed01', 'demoready002', 'visready0001');

-- Ready, kept, with gaps: several fee kinds, mixed currencies in Eastmere, every check result,
-- unclear rules and a verdict. Featured on the home (newest kept ready).
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, demo, state, dropped_items, sources_count,
  categories_json, verdict_json, unclear_json, research_minutes, created_at, started_at, finished_at
) VALUES (
  'demoready001',
  'open a small bakery',
  '["Port Aldren","Northhaven","Eastmere"]',
  'open a small bakery|eastmere|northhaven|port aldren',
  'admin', 1, 1, 'ready', 0, 18,
  '["Legal entity registration","Activity licence","Premises approval","Tax registration"]',
  '{"paragraph":"Port Aldren is the easiest place to start: fees are published and the wait is short.","tradeoffs":[{"place":"Port Aldren","line":"published fees and a short wait"},{"place":"Northhaven","line":"a longer wait and more filings"},{"place":"Eastmere","line":"mixed currencies on the same forms"}]}',
  '["Port Aldren - The premises stamp fee is not on the licensing page.","Northhaven - The food permit page does not say how long an inspection takes.","Eastmere - The shop licence does not say whether seating is included.","Port Aldren - Renewal for the company filing is listed on a different page."]',
  7,
  '2026-11-09T12:00:00.000Z',
  '2026-11-09T12:00:00.000Z',
  '2026-11-09T12:07:00.000Z'
);

INSERT INTO items (id, comparison_id, place_index, category_n, name, required, authority, fee, time_to, renewal, ongoing, url, host, quote, check_state, check_kind, checked_at, fee_lead_json) VALUES
('rdyitem00001', 'demoready001', 0, 1, 'Aldren bakery company filing', 'yes', 'Aldren Companies Desk', 'USD 300 (filing); USD 23 name reservation', '10 days', 'annual', 'none', 'https://companies.aldren.gov.example/bakery', 'companies.aldren.gov.example', 'A bakery files a company form with the Aldren Companies Desk. The fee is USD 300.', 'done', 'found', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00002', 'demoready001', 0, 2, 'Aldren food licence', 'yes', 'Aldren Licensing Office', 'free', '5 working days', 'annual', 'none', 'https://licensing.aldren.gov.example/food', 'licensing.aldren.gov.example', 'A bakery needs a food licence from the Aldren Licensing Office. There is no fee.', 'done', 'found', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00003', 'demoready001', 0, 3, 'Aldren premises stamp', 'yes', 'Aldren Licensing Office', 'not stated', 'not stated', 'none', 'none', 'https://licensing.aldren.gov.example/premises', 'licensing.aldren.gov.example', 'A change of use needs a premises stamp before trading begins.', 'done', 'quote_missing', '2026-11-09T12:06:00.000Z', '{"title":"Aldren premises fees","url":"https://licensing.aldren.gov.example/fees"}'),
('rdyitem00004', 'demoready001', 1, 1, 'Northhaven company roll', 'yes', 'Northhaven Civic Hall', 'GBP 100', '14 days', 'annual', 'confirmation statement', 'https://permits.northhaven.gov.example/company', 'permits.northhaven.gov.example', 'Every trader joins the Northhaven company roll. The fee is GBP 100.', 'done', 'found_fee_missing', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00005', 'demoready001', 1, 2, 'Northhaven food permit', 'yes', 'Northhaven Civic Hall', 'not stated', 'not stated', 'annual', 'none', 'https://permits.northhaven.gov.example/food', 'permits.northhaven.gov.example', 'Northhaven requires a food premises permit for every bakery.', 'done', 'unreadable', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00006', 'demoready001', 1, 3, 'Northhaven hall approval', 'depends', 'Northhaven Planning Desk', 'none', 'immediate', 'none', 'none', 'https://permits.northhaven.gov.example/hall', 'permits.northhaven.gov.example', 'Hall approval is given at once when the use does not change.', 'done', 'found', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00007', 'demoready001', 1, 4, 'Northhaven tax number', 'yes', 'Northhaven Revenue', 'not stated', 'not stated', 'annual return', 'none', NULL, NULL, 'No official page was given for this item.', 'done', 'no_url', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00008', 'demoready001', 2, 1, 'Eastmere trade licence', 'yes', 'Eastmere Trade Desk', 'USD 200', '5 working days', 'annual', 'none', 'https://trade.eastmere.gov.example/licence', 'trade.eastmere.gov.example', 'Eastmere issues a trade licence within five working days. The fee is USD 200.', 'done', 'found', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00009', 'demoready001', 2, 2, 'Eastmere shop permit', 'yes', 'Eastmere Trade Desk', 'GBP 50', 'not stated', 'annual', 'none', 'https://trade.eastmere.gov.example/shop', 'trade.eastmere.gov.example', 'A shop permit is required before seating is offered. The fee is GBP 50.', 'done', 'found', '2026-11-09T12:06:00.000Z', NULL),
('rdyitem00010', 'demoready001', 2, 3, 'Eastmere layout check', 'yes', 'Eastmere Trade Desk', 'not stated', '3 weeks', 'none', 'none', 'https://trade.eastmere.gov.example/layout', 'trade.eastmere.gov.example', 'The layout of a food shop is checked before the permit is issued.', 'done', 'found', '2026-11-09T12:06:00.000Z', '{"title":"Eastmere layout fees","url":"https://trade.eastmere.gov.example/fees"}'),
('rdyitem00011', 'demoready001', 2, 4, 'Eastmere tax registration', 'yes', 'Eastmere Revenue', 'AED 100', 'not stated', 'annual', 'none', 'https://tax.eastmere.gov.example/register', 'tax.eastmere.gov.example', 'Traders register for tax with Eastmere Revenue. The fee is AED 100.', 'done', 'quote_missing', '2026-11-09T12:06:00.000Z', NULL);
-- Port Aldren has no tax registration item: that cell shows "No item returned".

-- Checking: some items already read.
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, state, dropped_items, sources_count,
  categories_json, research_minutes, created_at, started_at
) VALUES (
  'democheck001',
  'run a small print shop',
  '["Port Aldren","Northhaven","Eastmere"]',
  'run a small print shop|eastmere|northhaven|port aldren',
  'admin', 0, 'checking', 0, 9,
  '["Legal entity registration","Activity licence","Premises approval","Tax registration"]',
  6,
  '2026-11-09T11:00:00.000Z',
  '2026-11-09T11:00:00.000Z'
);

INSERT INTO items (id, comparison_id, place_index, category_n, name, required, authority, fee, time_to, renewal, ongoing, url, host, quote, check_state, check_kind, checked_at) VALUES
('chkitem00001', 'democheck001', 0, 1, 'Aldren print company filing', 'yes', 'Aldren Companies Desk', 'USD 300', '10 days', 'annual', 'none', 'https://companies.aldren.gov.example/print', 'companies.aldren.gov.example', 'A print shop files a company form with the Aldren Companies Desk.', 'done', 'found', '2026-11-09T11:20:00.000Z'),
('chkitem00002', 'democheck001', 0, 2, 'Aldren print licence', 'yes', 'Aldren Licensing Office', 'USD 80', 'not stated', 'annual', 'none', 'https://licensing.aldren.gov.example/print', 'licensing.aldren.gov.example', 'A print shop needs an activity licence from the Aldren Licensing Office.', 'done', 'found', '2026-11-09T11:20:00.000Z'),
('chkitem00003', 'democheck001', 1, 1, 'Northhaven print roll', 'yes', 'Northhaven Civic Hall', 'GBP 100', '14 days', 'annual', 'none', 'https://permits.northhaven.gov.example/print', 'permits.northhaven.gov.example', 'Every print shop joins the Northhaven company roll.', 'unchecked', NULL, NULL),
('chkitem00004', 'democheck001', 2, 1, 'Eastmere print licence', 'yes', 'Eastmere Trade Desk', 'USD 200', '5 working days', 'annual', 'none', 'https://trade.eastmere.gov.example/print', 'trade.eastmere.gov.example', 'Eastmere issues a print shop trade licence within five working days.', 'unchecked', NULL, NULL);

-- Researching: TinyResearch is still reading.
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, state, research_run_id, created_at, started_at, research_started_at
) VALUES (
  'demoresrch01',
  'open a small mill',
  '["Port Aldren","Northhaven","Eastmere"]',
  'open a small mill|eastmere|northhaven|port aldren',
  'admin', 0, 'researching', 'run-local-research1',
  '2026-11-09T10:30:00.000Z',
  '2026-11-09T10:30:00.000Z',
  '2026-11-09T10:31:00.000Z'
);

-- Failed: the research did not come back in the agreed layout.
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, state, failed_reason, created_at, started_at, finished_at
) VALUES (
  'demofailed01',
  'open a small kiln',
  '["Port Aldren","Northhaven","Eastmere"]',
  'open a small kiln|eastmere|northhaven|port aldren',
  'admin', 0, 'failed', 'layout',
  '2026-11-09T09:00:00.000Z',
  '2026-11-09T09:00:00.000Z',
  '2026-11-09T09:12:00.000Z'
);

-- Second kept ready comparison, older than demoready001 so the home still features that one.
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, demo, state, dropped_items, sources_count,
  categories_json, verdict_json, unclear_json, research_minutes, created_at, started_at, finished_at
) VALUES (
  'demoready002',
  'run a small cafe',
  '["Port Aldren","Northhaven","Eastmere"]',
  'run a small cafe|eastmere|northhaven|port aldren',
  'admin', 1, 2, 'ready', 0, 9,
  '["Legal entity registration","Activity licence","Premises approval"]',
  '{"paragraph":"Port Aldren is the easiest place to start a cafe: the food licence is free and the wait is short.","tradeoffs":[{"place":"Port Aldren","line":"a free food licence"},{"place":"Northhaven","line":"a longer wait"},{"place":"Eastmere","line":"fees in two currencies"}]}',
  '["Eastmere - The cafe licence does not say whether seating is included."]',
  6,
  '2026-11-09T08:00:00.000Z',
  '2026-11-09T08:00:00.000Z',
  '2026-11-09T08:06:00.000Z'
);

INSERT INTO items (id, comparison_id, place_index, category_n, name, required, authority, fee, time_to, renewal, ongoing, url, host, quote, check_state, check_kind, checked_at, fee_lead_json) VALUES
('rdy2item0001', 'demoready002', 0, 1, 'Aldren cafe company filing', 'yes', 'Aldren Companies Desk', 'USD 300', '10 days', 'annual', 'none', 'https://companies.aldren.gov.example/cafe', 'companies.aldren.gov.example', 'A cafe files a company form with the Aldren Companies Desk. The fee is USD 300.', 'done', 'found', '2026-11-09T08:05:00.000Z', NULL),
('rdy2item0002', 'demoready002', 0, 2, 'Aldren cafe food licence', 'yes', 'Aldren Licensing Office', 'free', '5 working days', 'annual', 'none', 'https://licensing.aldren.gov.example/cafe', 'licensing.aldren.gov.example', 'A cafe needs a food licence from the Aldren Licensing Office. There is no fee.', 'done', 'found', '2026-11-09T08:05:00.000Z', NULL),
('rdy2item0003', 'demoready002', 1, 1, 'Northhaven cafe roll', 'yes', 'Northhaven Civic Hall', 'GBP 100', '14 days', 'annual', 'none', 'https://permits.northhaven.gov.example/cafe', 'permits.northhaven.gov.example', 'Every cafe joins the Northhaven company roll. The fee is GBP 100.', 'done', 'found', '2026-11-09T08:05:00.000Z', NULL),
('rdy2item0004', 'demoready002', 2, 1, 'Eastmere cafe licence', 'yes', 'Eastmere Trade Desk', 'USD 200', '5 working days', 'annual', 'none', 'https://trade.eastmere.gov.example/cafe', 'trade.eastmere.gov.example', 'Eastmere issues a cafe trade licence within five working days. The fee is USD 200.', 'done', 'found', '2026-11-09T08:05:00.000Z', NULL);

-- A visitor comparison still within its 7 days. Invented; not kept.
INSERT INTO comparisons (
  id, activity, places_json, reuse_key, origin, kept, state, dropped_items, sources_count,
  categories_json, verdict_json, unclear_json, research_minutes, created_at, started_at, finished_at, expires_at
) VALUES (
  'visready0001',
  'open a small bookshop',
  '["Port Aldren","Northhaven","Eastmere"]',
  'open a small bookshop|eastmere|northhaven|port aldren',
  'public', 0, 'ready', 0, 6,
  '["Legal entity registration","Activity licence"]',
  '{"paragraph":"Port Aldren is the easiest place to start a bookshop: the filing fee is published.","tradeoffs":[{"place":"Port Aldren","line":"a published filing fee"},{"place":"Northhaven","line":"a longer wait"},{"place":"Eastmere","line":"a trade licence in five working days"}]}',
  '[]',
  5,
  '2026-11-09T13:00:00.000Z',
  '2026-11-09T13:00:00.000Z',
  '2026-11-09T13:05:00.000Z',
  '2026-11-16T13:00:00.000Z'
);

INSERT INTO items (id, comparison_id, place_index, category_n, name, required, authority, fee, time_to, renewal, ongoing, url, host, quote, check_state, check_kind, checked_at, fee_lead_json) VALUES
('visitem00001', 'visready0001', 0, 1, 'Aldren bookshop filing', 'yes', 'Aldren Companies Desk', 'USD 300', '10 days', 'annual', 'none', 'https://companies.aldren.gov.example/bookshop', 'companies.aldren.gov.example', 'A bookshop files a company form with the Aldren Companies Desk. The fee is USD 300.', 'done', 'found', '2026-11-09T13:04:00.000Z', NULL),
('visitem00002', 'visready0001', 1, 1, 'Northhaven bookshop roll', 'yes', 'Northhaven Civic Hall', 'GBP 100', '14 days', 'annual', 'none', 'https://permits.northhaven.gov.example/bookshop', 'permits.northhaven.gov.example', 'Every bookshop joins the Northhaven company roll. The fee is GBP 100.', 'done', 'found', '2026-11-09T13:04:00.000Z', NULL),
('visitem00003', 'visready0001', 2, 1, 'Eastmere bookshop licence', 'yes', 'Eastmere Trade Desk', 'USD 200', '5 working days', 'annual', 'none', 'https://trade.eastmere.gov.example/bookshop', 'trade.eastmere.gov.example', 'Eastmere issues a bookshop trade licence within five working days. The fee is USD 200.', 'done', 'found', '2026-11-09T13:04:00.000Z', NULL);

-- Invented ledger rows so the about page has figures to show.
INSERT INTO spend (id, kind, amount_usd, ref, at) VALUES
('spd000000001', 'research', 0, 'demoready001', '2026-11-09T12:01:00.000Z'),
('spd000000002', 'research_run', 0, 'demoready001', '2026-11-09T12:07:00.000Z'),
('spd000000003', 'research', 0, 'demoready002', '2026-11-09T08:01:00.000Z'),
('spd000000004', 'research_run', 0, 'demoready002', '2026-11-09T08:06:00.000Z'),
('spd000000005', 'fetch', 0, 'https://licensing.aldren.gov.example/food', '2026-11-09T12:06:00.000Z'),
('spd000000006', 'fetch', 0, 'https://permits.northhaven.gov.example/company', '2026-11-09T12:06:10.000Z'),
('spd000000007', 'fetch', 0, 'https://trade.eastmere.gov.example/licence', '2026-11-09T12:06:20.000Z'),
('spd000000008', 'search', 0, 'find-port-aldren', '2026-11-09T12:00:30.000Z'),
('spd000000009', 'search', 0, 'find-northhaven', '2026-11-09T12:00:40.000Z'),
('spd000000010', 'search', 0, 'find-eastmere', '2026-11-09T12:00:50.000Z'),
('spd000000011', 'wallet', 0, 'wallet', '2026-11-09T12:07:30.000Z');
