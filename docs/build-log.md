# Redtape: build log

What changed from `docs/plans/2026-11-09-redtape.md` while building Tasks 1 to 3, and why. Written 9 November 2026. No TinyFish call was made.

## Task 1: scaffold, schema and TinyFish clients

Project files follow `backed` (same dependency versions): `package.json` name `redtape`, Wrangler D1 binding `DB`, cron `* * * * *`, assets, `SITE_ENABLED` `"0"`. Schema is one migration: `comparisons`, `items`, `place_sites`, `spend`, `public_use`, `run_slot`. TinyFish clients: shared `client.ts`, Fetch, Search, wallet, and a new Research client (`POST /v1/automation/run-research-async`, `GET /v1/research-run/{id}`) that prefers domains with `domain_filter.mode = include` and never requires them. Spend kinds are `research`, `research_run`, `fetch`, `search`, `wallet`. Government-domain labels live in `src/core/official.ts`. Tests intercept every outbound request.

## Task 2: the comparison

Question text is the tested wording from `make-query.mjs`. The report reader keeps items whose heading has a category number and `::`; `7a.` is kept as an extra item in category 7. Place matching uses the first words (up to a comma or parenthesis); two asked places that start alike fail the comparison rather than guessing. Proof check and figures follow spec sections 5 and 7. `advance` claims each step in one SQL statement: queued takes the slot, finding searches, researching stores the run id before the first poll, checking reads at most 4 pages. Import is `POST /admin/import` as the spec names it (not `/api/admin/import`).

## What differed from the plan

- **`POST /admin/import`**, as the spec, not Backed's `/api/admin/import`.
- **Spend kinds** are research-based (`research`, `research_run`), not TinySet's `dataset` / `dataset_run`.
- **A FAILED or CANCELLED research run** fails the comparison with the too-long sentence: the spec names no other research-failure words for the page.
- **D1 `database_id`** is a placeholder until a real database is created at deploy (Task 6).

## Pass over Task 2

Place names match when one is a whole-word prefix of the other. Fields are read by the words in the key; a missing fee or wait is stored as "not stated". Amounts compare as numbers. Mixed currency and bare amounts are listed, not added; dirhams are AED and Singapore dollars are SGD. A failed or cancelled research run, a completed run with no report, and a start that will not succeed on retry fail as `research_failed`, not as a timeout. The move to checking and the item rows are one database batch. The quote check is one pass over the quote and the page. Business days and years are read as waits. `POST /api/comparisons` answers 404 while `SITE_ENABLED` is not "1".

## Task 3: the questions for a lawyer

`lawyerSheet` turns a comparison as read into the sheet of spec section 8: unclear rules, one question per gap (exact words, kind order), real items only. Checked days go into words as "9 Nov 2026" (`shownDate`). A fee lead is one TinySearch on the item's own host after the proof check, claimed in one statement, at most 6 per comparison and 4 per `advance`; a miss or a failed search is stored as "none found" and does not fail the comparison. `research_minutes` is the run's duration in whole minutes, stored when moving to checking and on import. `GET /api/comparisons/:id` includes `questions`, each item's `fee_lead`, and `research_minutes`. Schema addition is `migrations/0002_research_minutes.sql` (`research_minutes` on `comparisons`); `fee_lead_json` was already on `items`.

## Pass over the engine (third)

A comparison that started a research run is booked when it ends, including when it fails, so spend is not left open. Finding and each poll are claimed in one statement; a poll is at most once a minute. A start whose claim is old and has no run id fails rather than starting a second paid run; a 429 or 5xx from the start call itself may still be tried again. Two places that start with the same words are refused on input. An item whose sentence was found but whose fee was not is a gap. `ItemView` carries `check_kind`. Fee-lead searches stop when the call's time budget is spent. Schema addition is `migrations/0003_find_and_poll_claims.sql`.

## Paid TinyFish calls

None. Tests intercept every outbound request. There is no `.dev.vars` in this project.
