# Redtape: build log

What changed from `docs/plans/2026-11-09-redtape.md` while building Tasks 1 to 4, and why. Written 9 November 2026. No TinyFish call was made.

## Task 1: scaffold, schema and TinyFish clients

Project files follow `backed` (same dependency versions): `package.json` name `redtape`, Wrangler D1 binding `DB`, cron `* * * * *`, assets, `SITE_ENABLED` `"0"`. Schema is one migration: `comparisons`, `items`, `place_sites`, `spend`, `public_use`, `run_slot`. TinyFish clients: shared `client.ts`, Fetch, Search, wallet, and a new Research client (`POST /v1/automation/run-research-async`, `GET /v1/research-run/{id}`) that prefers domains with `domain_filter.mode = include` and never requires them. Spend kinds are `research`, `research_run`, `fetch`, `search`, `wallet`. Government-domain labels live in `src/core/official.ts`. Tests intercept every outbound request.

## Task 2: the comparison

Question text is the tested wording from `make-query.mjs`. The report reader keeps items whose heading has a category number and `::`; `7a.` is kept as an extra item in category 7. Place matching uses the first words (up to a comma or parenthesis); two asked places that start alike fail the comparison rather than guessing. Proof check and figures follow spec sections 5 and 7. `advance` claims each step in one SQL statement: queued takes the slot, finding searches, researching stores the run id before the first poll, checking reads at most 4 pages. Import is `POST /admin/import` as the spec names it (not `/api/admin/import`).

## What differed from the plan

- **`POST /admin/import`**, as the spec, not Backed's `/api/admin/import`.
- **Spend kinds** are research-based (`research`, `research_run`), not TinySet's `dataset` / `dataset_run`.
- **A FAILED or CANCELLED research run** fails the comparison as `research_failed`, with its own sentence: "This comparison did not finish: the research run failed. Nothing is shown." The spec names only the layout and too-long failures.
- **"none stated"** is read as the same gap as "not stated" and stored as "not stated", with what follows kept. The spec names only "not stated"; real reports also write "none stated". "none", "free", "no fee" and "0" stay stated fees.
- **D1 `database_id`** is a placeholder until a real database is created at deploy (Task 6).

## Pass over Task 2

Place names match when one is a whole-word prefix of the other. Fields are read by the words in the key; a missing fee or wait is stored as "not stated". Amounts compare as numbers. Mixed currency and bare amounts are listed, not added; dirhams are AED and Singapore dollars are SGD. A failed or cancelled research run, a completed run with no report, and a start that will not succeed on retry fail as `research_failed`, not as a timeout. The move to checking and the item rows are one database batch. The quote check is one pass over the quote and the page. Business days and years are read as waits. `POST /api/comparisons` answers 404 while `SITE_ENABLED` is not "1".

## Task 3: the questions for a lawyer

`lawyerSheet` turns a comparison as read into the sheet of spec section 8: unclear rules, one question per gap (exact words, kind order), real items only. Checked days go into words as "9 Nov 2026" (`shownDate`). A fee lead is one TinySearch on the item's own host after the proof check, claimed in one statement, at most 6 per comparison and 4 per `advance`; a miss or a failed search is stored as "none found" and does not fail the comparison. `research_minutes` is the run's duration in whole minutes, stored when moving to checking and on import. `GET /api/comparisons/:id` includes `questions`, each item's `fee_lead`, and `research_minutes`. Schema addition is `migrations/0002_research_minutes.sql` (`research_minutes` on `comparisons`); `fee_lead_json` was already on `items`.

## Pass over the engine (third)

A comparison that started a research run is booked when it ends, including when it fails, so spend is not left open. Finding and each poll are claimed in one statement; a poll is at most once a minute. A start whose claim is old and has no run id fails rather than starting a second paid run; a 429 or 5xx from the start call itself may still be tried again. Two places that start with the same words are refused on input. An item whose sentence was found but whose fee was not is a gap. `ItemView` carries `check_kind`. Fee-lead searches stop when the call's time budget is spent. Schema addition is `migrations/0003_find_and_poll_claims.sql`.

## Task 4: the look, the home and a comparison's page

The site shell, the home and a comparison's page sit behind `SITE_ENABLED`. Switched off, a page path answers the API's JSON 404; the API keeps working. The home is built from the newest kept ready comparison, with the approved look's classes and the display rules used on stored data (short fee, short wait, tape from each item's check, unclear lines). The form posts to `POST /comparisons` and goes to the new page, or shows the limit or input sentence with the typed values kept. A comparison's page covers running (plain state, a refresh every 5 seconds), ready (cells as `details`, including gaps), and failed. An unknown id is a 404 in the shell. CSS for screens the look did not cover is only at the end of `site.css`. Local seed comparisons are invented. No TinyFish call was made.

## Pass over the look (second)

The headline's second line is sized from its letter count so the whole question stays on one line; the look's "to open a cafe?" keeps the display size, and the seam still cuts the letters. A comparison's running or failed state sits in the red half of the first screen, under the places. A long list of lawyer questions no longer pushes its paragraph off the heading. With no TinyFish key, the client throws `no_key` and makes no request. Seed ids and the page route are 12 characters. Saved rows show the activity with a capital first letter.

## Pass over the look (third)

The headline's second line is sized from the width between the margins, never larger than the display size, so a long activity stays on one line on a phone. A ready comparison's first screen holds the verdict (or one line per place), a link to the grid, and the disclaimer. Running and failed pages are unchanged. No TinyFish call was made.

## Task 5: the other screens and the exports

The sheet, saved comparisons, how it works, API, about and not-found sit behind `SITE_ENABLED` in the shell. Saved list is kept ready comparisons and visitor ones still within 7 days, newest first. JSON is the API object; CSV is one row per item, RFC 4180, a formula guard, a UTF-8 byte-order mark, and 409 when the comparison is not ready. Every page has a title, description, canonical URL, Open Graph and Twitter tags, and the favicon. CSS for these screens and for print is only at the end of `site.css`. Local seed adds a second kept comparison, a visitor comparison and spend rows. No TinyFish call was made.

## Pass over the other screens (second)

CSV tests match quoting of a guarded carriage return, the byte-order mark as bytes, and 409 with a running state. Inner-page headings sit at the top left. The sheet puts each place on its own line and prints each address once. API examples use Work Sans and wrap. An unknown comparison and an unknown page have their own sentences. Long official addresses wrap inside the column on a phone. The social image is the first screen at 1200 by 630.

## Pass over the engine (fourth), 10 November

Six faults, each with a test that failed first.

- **A research start is sent once.** Before, a start whose answer left the outcome open (a 5xx, a dropped connection, a 2xx with no run id) cleared its claim and was sent again every minute, each one a new deep run. Now only a plain refusal clears the claim: a 429 is tried again for up to 20 minutes, any other 4xx fails the comparison with nothing booked. Anything else keeps the claim; after 5 minutes the comparison fails and the run is booked, because TinyFish may have accepted it. The wallet is read and stored before the call, so that booking has something to stand on.
- **What a run cost.** An unchanged wallet no longer makes every run free: only Redtape's first two runs of a UTC day. A later run is booked at $2 until the wallet, read ten minutes on, shows less. The balance read before the next run starts settles the run before it, since after that the wallet holds both. A balance down by more than $2 brings a run up to $2 instead of being ignored. A wallet that cannot be read leaves the run unsettled, to be read again.
- **A status word the reader does not know** counts as still running. Only FAILED, CANCELLED, TIMED_OUT, or COMPLETED with no report, fail a comparison; the 25-minute limit ends the rest.
- **A fee's amount** is the first number written beside a currency. "Form 1023 filing fee: USD 600" is 600, not 1023; "From 1 January 2026: AED 500" is 500, not 1. "US$50" is US dollars, not Singapore dollars. A fee that names no currency gives its first number.
- **Finding has a deadline.** A search that keeps failing is given up 10 minutes after the comparison began, and the research goes on without preferred sites. The slot's clock starts again when the research start is sent, so it is held for the whole run.
- **The visitor hash needs its salt.** With `WEBHOOK_SECRET` not set, no hash is made and no public comparison starts: "New comparisons are closed for the moment. Saved comparisons still open."

Also: with no TinyFish key, `advance` moves nothing and fails nothing. 221 tests.

## The two saved runs, read on my machine (10 November)

I imported the two finished runs of 9 November into a local copy (free: reading a saved run, Fetch and Search cost nothing) and read both comparisons line by line. The cafe: 21 items, 18 sentences found again on their pages, 3 not. The drone business: 25 items, 19 found, 3 found without their fee, 3 not. What was wrong, and is now fixed with a test each:

- **A fee that says "not stated" further in** ("Theory test fee and practical assessment fee not stated (the regulator does not set them)") was counted as a stated fee and drew red tape. With no figure and no "free" in it, it is now the same gap as a fee that starts with "not stated".
- **A number inside a name was taken for a fee.** "Flyer ID: free (online test); GVC/RPC-L1: not stated" gave 1, so the United Kingdom's fees were listed instead of added. A fee that names no currency now gives a number only when it begins with one. The United Kingdom reads "at least GBP 536.34".
- **Sums** are written with their separator: "at least AED 6,700".
- **A fee lead could be a site map.** It is passed over now.
- **The home showed the newest saved comparison**, not the first demo. The first demo is featured when it is ready.
- **The footer** names me on every page with a link to my GitHub profile, and the head carries `meta name="author"`.

**The proof check on a long page.** The largest official page in the two runs is 64,818 characters. Splitting it into words and comparing every quote word with every page word took 6 to 15 ms of processor time for one item, more than a whole request may use on the plan this runs on. The check now looks only around the places where the longest word from the middle of the quote appears (every run long enough to count must hold that word), and compares in one pass. The same item takes about 0.6 ms, and the cost no longer grows with the page. A test compares the result with the plain word-by-word way on 400 made-up pages, and the old and new way agree on all 46 real pages. The every-minute job reads 4 pages in one run in all, not 4 for each comparison. 240 tests.

## The pages with real comparisons (10 November)

Photographed at 1440 wide from the local copy and read through. The verdict's place is found by its first words, so "Manchester is the easiest place to start" gives "Shortest tape: Manchester" (the asked place is "Manchester, England"). A comparison's own page gives the verdict whole; the home cuts it to fit. The questions for a lawyer sit in three columns, one for each place, each item's questions together: the page is a quarter shorter. The sheet and the two downloads share one row. An unclear rule on the home no longer ends in an open bracket. The API example uses real places.

## Task 7: watching a saved comparison

Built before the site is live; nothing is watched until `POST /admin/watch` is called for a saved comparison.

- **Which pages.** Each official page with an item whose fee is stated and whose sentence was found, 12 pages in all at most (`watches`, migration `0004_watching.sql`).
- **The Monitors.** The every-minute job creates one TinyFish Page Monitor in a run: the row is claimed first, the Monitor reads once a day in the 05:00 UTC hour and calls `POST /hooks/monitor/<secret>`. A plain refusal marks the page failed; an answer that leaves the outcome open marks it unknown and the call is never sent again. A Monitor whose first read gave no text is deleted at once.
- **The hook.** A wrong secret is 404 with no body, a Monitor that is not Redtape's own is 404, a run delivered twice is booked once. Each run is one ledger row at $0.005.
- **A change.** The page is read again with Fetch and the items that rest on it are checked again. A sentence still there keeps its result with the new day. A sentence that was there and is gone becomes "The official page changed on <date>: check this item again.", counts as a gap, and becomes a question for the lawyer. A page that cannot be read is tried 3 times, 5 minutes apart.
- **Stopping.** `POST /admin/unwatch` deletes each Monitor by its own id, then its row.
- **What the pages say.** A watched comparison says how many of its pages are read again and when the last read was; `/api/stats` and the About page count the checks and their cost.

Not built: reading a Monitor's own history. TinyFish gives none over the API, so a Monitor that stops calling shows only as an old "last read" day. 270 tests.

## Live (10 November)

Deployed with the pages switched off: the database created and its four migrations applied, the three secrets set, every page path 404, the API answering, the admin routes 401 without the token, the hook 404 on a wrong secret.

**The two saved comparisons, on the live Worker.** I adopted the two runs of 9 November by run id (`POST /admin/import`, no cost). The every-minute job did the rest with nobody watching: 48 page reads and 12 searches, the cafe ready in 9 minutes and the drone business in 15.

| | Items | Proved | Sentence there, fee not | Not confirmed | Page not read |
|---|---|---|---|---|---|
| A small cafe: Austin, Manchester, Dubai mainland | 21 | 16 | 0 | 3 | 2 |
| A small drone business: United Kingdom, Singapore, Dubai | 25 | 19 | 3 | 3 | 0 |

The two pages that could not be read are both on Manchester City Council's site. On my machine the same day one of them was read and its sentence found; on the live Worker neither was read. The item says so, counts as a gap and is a question on the lawyer's sheet. I left it as it came out.

**Processor time, from `wrangler tail`.** The plan allows 10 ms a request. A cron run with nothing to do uses 5 to 10 ms. A run that reads and checks 4 pages used 15 to 38 ms, thirteen times in a row, and each ended `ok`: the platform did not cut one. Reading a whole comparison for its page or its JSON took 3 to 18 ms, 9 in the middle. I kept 4 pages a run. If a run is ever cut, each item is claimed and saved on its own and an open claim is taken again after 2 minutes, so the check goes on from where it stopped.

**A Texas state page was labelled wrong.** `sos.state.tx.us` came out as "official body's own site, not a government domain". The older United States addresses (`state.<st>.us`, `ci.<city>.<st>.us`, `co.<county>.<st>.us`) are government domains now. It was the only wrong label among the 16 hosts in the two comparisons. 280 tests.

**The home's own example started a new run.** The form is filled with the featured comparison in short ("Austin", "Manchester", "Dubai mainland"), and the saved comparison holds "Austin, Texas" and "Manchester, England". Pressed as shown, it did not find the saved one: it would have started a new research run and used one of the day's two. A saved comparison is now opened for its places in short, in any order, and at any age (it was found only for 7 days, which ends on the day the bounty closes). "Austin, Minnesota" is still another place. Found by reading the form's own values before anyone pressed it. 285 tests.

**The pages, switched on.** Once the Worker is warm the home takes 9 ms of processor time and a comparison's page 13 to 14; the other pages 3 to 7. The first page after a deploy took 31 to 39 ms. All ended `ok`.

**The watch, switched on.** `POST /admin/watch` for both saved comparisons listed 6 pages each, 12 in all. The every-minute job created one Monitor a minute for 12 minutes; all 12 are active, each with its id stored. 6 items of the cafe and 10 of the drone business now say they are watched. The first daily reads come in the 05:00 UTC hour.

## Paid TinyFish calls

- 10 November: 12 Page Monitors created for the watch, each booked as one read at $0.005: $0.06. From then on about $0.06 a day while the watch is on.

Nothing else. The three research runs of 9 November were free runs of the day, adopting a saved run costs nothing, and Fetch and Search are free. Tests intercept every outbound request and never reach TinyFish.
