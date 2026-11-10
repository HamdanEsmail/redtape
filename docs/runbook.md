# Redtape: runbook

How I run Redtape: what is deployed, the three secrets, a first deploy, the site switch, the saved comparisons, the watch, the money, and what to do when something stops.

## What is deployed

- One Cloudflare Worker, `redtape`, at https://redtape.hamdanesmail12-7a9.workers.dev
- One D1 database, `redtape`, bound as `DB`. Its id is in `wrangler.jsonc`.
- Static files from `public/` (styles, pictures, the icon), served before the Worker runs.
- One cron trigger, every minute. It moves each unfinished comparison forward, deletes visitors' comparisons after 7 days, settles the cost of a finished research run, creates one Monitor and reads one changed page again.

Two settings in `wrangler.jsonc`:

| Setting | What it does |
|---|---|
| `PUBLIC_BASE_URL` | The address the pages and the Monitor hook are built from. |
| `SITE_ENABLED` | `"1"`: the pages answer. `"0"`: every page path answers 404 and the API keeps working. |

## The three secrets

| Secret | What it is for | Without it |
|---|---|---|
| `TINYFISH_API_KEY` | Every TinyFish call. | Nothing moves and nothing fails: a comparison waits where it is. |
| `ADMIN_TOKEN` | The admin routes, sent as `Authorization: Bearer <token>`. | Every admin route answers 401. |
| `WEBHOOK_SECRET` | The last part of the Monitor hook's address, and the salt of the visitor hash. | The hook answers 404, and no visitor can start a comparison: "New comparisons are closed for the moment." |

```bash
npx wrangler secret put TINYFISH_API_KEY
```

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
npx wrangler secret put WEBHOOK_SECRET
```

The last two are long random strings of my own making. Locally the same three names go in `.dev.vars` (copy `.dev.vars.example`). Neither file with real values is ever committed.

## A first deploy

```bash
npx wrangler d1 create redtape
```

Put the id it prints into `wrangler.jsonc` (`d1_databases[0].database_id`), then:

```bash
npm run migrate:remote
```

```bash
npm run check
```

```bash
npm run deploy
```

`npm run check` is the typecheck, the tests and a dry-run deploy; it is what CI runs on every push. After the deploy, set the three secrets. With `SITE_ENABLED` at `"0"` the address answers like this, and should:

| Request | Answer |
|---|---|
| `GET /` | 404 |
| `GET /api/stats` | 200, the figures |
| `POST /api/admin/ping` without the token | 401 |
| `POST /api/admin/ping` with the token | 200 `{"ok":true}` |
| `POST /hooks/monitor/anything` | 404, no body |

## Looking before switching on

```bash
npx wrangler versions upload --var SITE_ENABLED:1
```

This uploads a version with the pages on and prints a preview address. The preview reads the live database, and live traffic stays on the deployed version. I check every page there first. To put the site live, set `SITE_ENABLED` to `"1"` in `wrangler.jsonc` and run `npm run deploy`.

## The saved comparisons

A finished TinyResearch run can be adopted by its run id at no cost. Redtape reads the saved report, files its items, and then runs its own proof check on every official page (Fetch, free) and looks for fee pages (Search, free).

```bash
curl -s -X POST "$BASE/admin/import" -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"run_id":"<the run id from TinyFish>","activity":"open a small cafe","places":["Austin, Texas","Manchester, England","Dubai mainland"],"demo":1}'
```

`demo` is 1, 2 or 3: a saved comparison with a demo number is kept for good, and demo 1 is the one the home shows. The answer is `202 {"id": "...", "state": "checking"}`. The every-minute job finishes the check on its own, 4 pages a minute; the two saved comparisons took 9 and 15 minutes. `GET /api/comparisons/<id>` shows the state.

## The watch

Nothing is watched until I ask for it.

```bash
curl -s -X POST "$BASE/admin/watch" -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"id":"<comparison id>"}'
```

The answer lists the pages: each official page with an item whose fee is stated and whose sentence was found, 12 pages at most across every watched comparison. The every-minute job then creates one TinyFish Page Monitor in a run. Each Monitor reads its page once a day in the 05:00 UTC hour and calls `POST /hooks/monitor/<WEBHOOK_SECRET>`. A read costs $0.005, so 12 pages cost $0.06 a day.

A page's row in `watches` is in one of five states:

| State | Meaning | What I do |
|---|---|---|
| `waiting` | Listed, its Monitor is not created yet. | Nothing. The next runs create it. |
| `creating` | The create call is on its way. | Nothing. |
| `active` | The Monitor exists and its id is stored. | Nothing. |
| `failed` | TinyFish refused the Monitor, or its first read gave no text and Redtape deleted it. | Nothing. The page is simply not watched. |
| `unknown` | The create call was sent and no clear answer came back. It is never sent again, so a Monitor is never made twice. | Look in the TinyFish dashboard for a Monitor on that page's address made at that time. If there is one, delete it there. Then unwatch and watch the comparison again. |

To stop watching:

```bash
curl -s -X POST "$BASE/admin/unwatch" -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"id":"<comparison id>"}'
```

It deletes each Monitor by its own stored id, then its row. Redtape only ever reads or deletes Monitors whose ids are in its own database. If it answers `502 monitor_not_deleted`, TinyFish did not confirm a delete: run it again.

TinyFish gives no history of a Monitor's runs over the API. A Monitor that has stopped calling shows only as an old "last read" day on the comparison's page.

## The money

| Call | Price |
|---|---|
| TinyResearch, deep | The account's first 2 completed runs of a UTC day are free, then $2 a run |
| Fetch | Free |
| Search | Free |
| Monitor | $0.005 a read |

Every call is one row in the `spend` table, and `/api/stats` and the About page add them up. A research run is booked from what the wallet shows was charged, read again ten minutes after the run ends. No new comparison starts once the ledger reaches $8, and no page is added to the watch. Stored comparisons always open.

Visitors can start 2 comparisons a day in all, 1 each, and one comparison runs at a time.

## What I look at

- `GET /api/stats`: comparisons by state, spend, calls by service, whether new comparisons are open.
- `npx wrangler tail redtape --format json`: every request and cron run with its outcome and processor time.

Processor time, measured on the live Worker on 10 November 2026 (Workers Free plan, which allows 10 ms a request):

| What | Processor time |
|---|---|
| A cron run with nothing to do | 5 to 10 ms |
| A cron run that reads and checks 4 official pages | 15 to 38 ms |
| `GET /api/comparisons/<id>` | 3 to 18 ms, 9 in the middle |
| `GET /api/stats` | 5 to 13 ms |
| The home, once the Worker is warm | 9 ms |
| A comparison's page, once warm | 13 to 14 ms |
| The sheet, the saved list, how it works, API, about, not found | 3 to 7 ms |
| The first page after a deploy or a quiet spell | 31 to 39 ms |

Every one of these ended `ok`: the platform did not cut a run that went over. If it ever does (`exceededCpu` in the tail), nothing is lost, because each item is claimed and saved on its own and a claim left open is taken again after 2 minutes. The knob is `CHECKS_PER_ADVANCE` in `src/core/limits.ts`: fewer pages in a run, more runs.

## When something is wrong

| What I see | Why | What to do |
|---|---|---|
| A comparison stays at "researching" | TinyResearch is still running. A deep run took 5 to 7 minutes in my tests. | Wait. After 25 minutes it fails on its own with "TinyResearch took too long." |
| "This comparison did not finish: the research did not come back in the agreed layout." | The report could not be read into rows. Nothing is shown from it. | Start it again another day; the run was booked. |
| "New comparisons are closed: this demo has spent its budget." | The ledger reached $8. | Raise `SPEND_STOP_USD` only after looking at the `spend` table. |
| "New comparisons are closed for the moment." | `WEBHOOK_SECRET` is not set. | Set it. |
| "Today's 2 new comparisons are used." | The daily limit. | It opens again at 00:00 UTC. |
| An item says "The official page could not be read" | Fetch could not read the page in 3 tries, or the site refused. | Nothing. The item counts as a gap and becomes a question for the lawyer. |
| An item says "The official page changed on <date>" | A Monitor reported a change and the quoted sentence is no longer on the page. | Read the page. It is the watch doing its job. |
| The hook answers 404 to TinyFish | The secret in the address is not the Worker's `WEBHOOK_SECRET`, or the Monitor is not one of Redtape's. | If the secret was changed, unwatch and watch again so the Monitors are made with the new address. |

## Local run

```bash
npm install
```

```bash
npm run migrate:local
```

```bash
npx wrangler d1 execute DB --local --file scripts/seed-local.sql
```

```bash
npx wrangler dev --var SITE_ENABLED:1 --test-scheduled
```

The seed holds invented comparisons, so every screen and every state can be seen without a TinyFish call. With `--test-scheduled`, opening `/__scheduled?cron=*+*+*+*+*` runs the every-minute job once.
