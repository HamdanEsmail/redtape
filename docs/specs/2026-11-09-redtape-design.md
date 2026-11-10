# Redtape: design

Built for the TinyFish Compliance Map bounty (closes 17 November 2026).

## 1. What it is

A founder asks: where should I set up? Redtape takes one activity and three places (cities, states or
countries) and returns every licence, permit, registration and filing each place asks for, lined up in the same
rows, with the fee, the wait, the renewal and the ongoing filings of each, a link to the official page it came
from, the sentence on that page it rests on, and the day Redtape read that page. It ends with a recommendation
and the trade-off for each place, and a sheet of questions for a lawyer.

What the bounty asks for, and where it lands:

| Asked for | In Redtape |
|---|---|
| One activity and at least three places | One line and exactly three places |
| Requirements from official government sources | TinyResearch held to official sites, then every page read again |
| Side by side: steps, cost, time, renewals, filings, a source link per item | The grid, one row per category |
| A recommendation with the trade-offs | The verdict, with the figures behind it |
| A demo on at least two activities | A cafe and a drone business, both saved |
| Every requirement dated | The day Redtape itself read the page |
| Gaps flagged, never guessed | "not stated", shown as an open piece of tape |
| Not a licence-holder check | It reads rules, never a person or a business |

## 2. What I tested on 9 November 2026

Three TinyResearch runs in `deep` mode, all free (two a day per account are free).

- A loose question (a cafe in Austin, Manchester, Dubai): a good report in 7 minutes from 35 official pages, but
  the categories drifted between places and fields changed names. A parser recovered 25 items, 22 with a link.
- The same question with a fixed layout (section 4): 7 categories, the same 7 for each place, 21 items, every
  item with all 8 fields, 50 official pages, 5 minutes. The recommendation named Manchester. Dubai's fees came
  back "not stated" in every row: no official page publishes them.
- A drone business in the United Kingdom, Singapore and Dubai with the fixed layout: 8 categories, 24 items, all
  fields present, 36 official pages, 7 minutes. 19 of the 24 links were pages the run had read; 16 quotes were
  found word for word among the sentences the run saved. The rest is what the proof check (section 5) is for.

What a saved run carries (`GET /v1/research-run/{id}`): `status`, `query`, `created_at`, `completed_at`,
`deep_result.result` (the report, markdown), `deep_result.citations`, and `evidence[]`, each with `url`, `title`,
`fetched_at` and `claims[]` holding a verbatim `snippet`. Official bodies are not always on government domains:
the UK aviation regulator is on `caa.co.uk`.

## 3. How a comparison runs

States: `queued` → `finding` → `researching` → `checking` → `ready`, or `failed` with a reason.

1. **queued.** The activity and the three places are stored. One comparison runs at a time; the next waits.
2. **finding.** One TinySearch per place ("<place> official government business licence <activity>"). The hosts
   of the results that are government domains (section 6) are kept as that place's preferred sites, at most 6
   per place. A place with none still goes on: the research is told to use official sources in any case. A
   search that keeps failing is given up after 10 minutes, and the research goes on without preferred sites.
3. **researching.** One TinyResearch run, `deep`, started with the question of section 4 and the preferred
   sites as `domain_filter` (prefer, never require). The run id is stored before anything else. It is read once
   a minute. More than 25 minutes without an end: `failed`, "TinyResearch took too long". A status word the
   reader does not know counts as still running. The start is sent once: a refusal for now (a 429) is tried
   again for up to 20 minutes, and an answer that leaves the outcome open (a dropped connection, a 5xx, no run
   id) is never sent again: after 5 minutes the comparison is `failed` and the run is booked (section 11).
4. **checking.** The report is read into items (section 4). Each item's official page is read again with
   TinyFetch and its sentence looked for (section 5). Items are checked a few at a time, so no step is long.
5. **ready.** The totals and the verdict are worked out (section 7) and stored.

`advance(id)` does one small step and is called after a page answers (`waitUntil`) and by a cron every minute.
Each step claims its work in one SQL statement, so the page and the cron never do the same step twice. This is
the engine of `../backed`, with other steps.

A comparison with the same activity and the same three places (normalised, order ignored) made in the last 7
days is reused and costs nothing.

## 4. The question, and reading the answer

The question sent to TinyResearch is fixed text around the activity and the places. It asks for official
government sources only, for 6 to 9 categories chosen to fit the activity and used with the same names in the
same order for every place, and for this layout and nothing outside it:

```
## Categories
(a numbered list)

## Place: <place exactly as given>
### <category number>. <category name> :: <short name of the item>
| Field | Value |
|---|---|
| Required | yes, no, or depends (with the condition) |
| Authority | ... |
| Fee | the official fee with its currency, or not stated |
| Time to approval | as the page states it, or not stated |
| Renewal | ... |
| Ongoing filings | ... |
| Official URL | one URL |
| Quote | one sentence copied exactly from that page |

## Summary
## Recommendation
## Unclear
```

The full wording is in `src/research/question.ts`, taken from the tested text
(`../spikes/compliance-9nov/make-query.mjs`). It tells the research to write "not stated" where an official page
gives no fee or time, never to estimate, and to write one item for a category that does not apply, saying so.

Reading the report:

- `## Categories` gives the rows. Fewer than 4 or more than 12: `failed`, "the research did not come back in
  the agreed layout".
- Each `## Place:` section gives that place's items. A place named in the report is matched to a place asked
  for by its first words; a place with no section: `failed`, same reason.
- An item needs its category number and its `Official URL` to be read; an item without a readable heading is
  dropped and counted. A category with no item for a place shows "No item returned" in that cell.
- A value that starts with "not stated" (any case) is a gap. Nothing else is.
- `## Recommendation`: the first paragraph is the research's verdict; a paragraph that starts with a place's name
  is that place's trade-off. `## Unclear`: each list line is one unclear rule.
- Markdown marks, citation numbers in brackets and stray quotation marks are removed from values.

The report is untrusted text. Everything from it is escaped on output, and a link is made only from an `http` or
`https` URL.

## 5. The proof check

For every item with an official URL, Redtape reads that page itself with TinyFetch (free) and looks for the
item's quote. Reads wait 15 seconds, are tried up to 3 times when they time out or the service is busy, and are
final at once when the page is blocked or missing.

Text is compared after lower-casing, removing punctuation and collapsing spaces. The quote is **found** when a
run of its words, in order, is on the page that is at least 8 words long (or the whole quote, when shorter) and
covers at least 60% of the quote's words.

When the item states a fee, its amount is also looked for on the page as digits with their separators
("300", "1,000", "12.34"). The amount is the first number written beside a currency, so a form number, a class
or a date in front of it is never taken for money: "Form 1023 filing fee: USD 600" is 600. A fee that names no
currency gives its first number.

| Result | Shown as |
|---|---|
| Quote found, and the fee's amount is on the page (or no fee is stated) | "Read again on <date>: the sentence is on the page." |
| Quote found, the fee's amount is not on that page | "The sentence is on the page; the fee is not. Confirm the fee." |
| Quote not found | "Not confirmed: the page did not show this sentence when read on <date>." |
| Page could not be read | "The official page could not be read on <date>." |
| No official URL | "No official page was given for this item." |

Every result keeps the date of Redtape's own read; that is the "checked" date on the item. An item that is not
confirmed stays in the grid, marked, and becomes a question for the lawyer. It is never dropped silently and
never shown as proved.

The source is labelled, not filtered: "government domain" when the host matches section 6, otherwise "official
body's own site, not a government domain". The UK aviation regulator must not be hidden because its address
ends in `.co.uk`.

## 6. Government domains

A host is a government domain when it ends with one of: `.gov`, `.gov.<cc>`, `.gouv.<cc>`, `.gob.<cc>`,
`.go.<cc>`, `.govt.<cc>`, `.gc.ca`, `.mil`, `.europa.eu`, `.admin.ch`, `.bund.de`, or is on a short list kept in
`src/core/official.ts` (for example `service-public.fr`, `rijksoverheid.nl`, `gov.uk` itself). The list is a
label and a search preference, never a reason to reject a source.

## 7. The figures and the verdict

For each place, from its items:

- **Requirements:** items whose `Required` starts with yes or depends.
- **Fees stated:** how many items state a fee, of how many.
- **Stated fees, added up:** the amount of each stated fee (as in section 5), added when they share a currency, shown as
  "at least <sum>" with "<n> fees not stated" beside it. Mixed currencies inside one place: no sum, the list.
  Currencies are never converted between places; the page says so.
- **Longest stated wait:** each stated time turned into days where it can be (hours, days, working days, weeks,
  months; a range takes its upper end; "immediate" is 0), the longest shown in the page's own words.
- **Gaps:** items with a fee not stated, a time not stated, or not confirmed.

The verdict shown is the research's own first paragraph, under the heading "Shortest tape: <place>", with each
place's trade-off line. Under it sit the figures above, so the reader can see what the verdict stands on. When
the place named has more than half of its fees not stated, one sentence says so: "<Place> cannot be judged on
cost: <n> of <m> fees are not stated on official pages."

The tape above each place has one piece per item: red when its fee is stated and confirmed, pale when stated
but not confirmed, open when not stated.

## 8. The sheet for a lawyer

`/comparisons/:id/brief`, made to print. In this order: the activity and the places; every unclear rule from
the report; then one question per gap, written from the item ("What is the fee for <item> in <place>? The
official page does not state it." with the link; "Is <item> still required in <place>? The page did not show the
quoted sentence when read on <date>."); then the full list of items with their links and checked dates.

For a gap in a fee, one TinySearch on the item's own official host ("<item> fee schedule site:<host>") may add a
lead: "A page on the same site that may hold the fee: <title>, <link>". It is a lead and is worded as one. It
never puts a number in the grid.

## 9. Watching a saved comparison (after the product is live)

For the saved demo comparisons, a TinyFish Page Monitor on each official page that carries a confirmed fee, at
most 12 pages in all, once a day. When a Monitor reports a change, the proof check runs again for the items on
that page. An item whose sentence is gone shows "The official page changed on <date>: check this item again."
Built last, and only after the product is live. Only Monitors created by this project, with their ids in its
database, are ever read or deleted.

## 10. Where TinyFish is used

| Service | Its job here |
|---|---|
| TinyResearch | Reads each place's official rules and returns every requirement in the fixed layout, each point cited |
| Search | Finds each place's official sites before the research, and a possible fee page for a gap |
| Fetch | Reads every official page again for the proof check |
| Monitor | Watches the fee pages of saved comparisons for changes |

## 11. Limits and money

- One comparison in progress at a time. 2 new comparisons a day in all from visitors, 1 per visitor a day.
- A TinyResearch run costs $2 once the account's 2 free runs of the UTC day are used. The ledger books what the
  wallet shows was charged, read again some minutes after the run ends. A run can be charged after it ends, so
  an unchanged wallet makes a run free only for Redtape's first two runs of the day; a later run is booked at
  $2 until the wallet, read ten minutes on, shows less. The wallet is one balance for every run on the account:
  a read counts for a run only while no later run has started (the read before the next start is the last one
  used), and a balance down by more than $2 only ever brings a run up to $2. A wallet that cannot be read
  leaves the run to be read again.
- Spend stop at $8: no new comparison starts. Stored comparisons always open. Fetch and Search are free.
- A visitor's comparison is kept 7 days; the saved demos stay.
- The activity is at most 200 characters, each place at most 80. A visitor is known only by a salted hash of
  their address. The salt is a secret of the deployment; without it no hash is made and no comparison starts.

## 12. Screens

- **Home `/`.** As `design/comp-home.html`: the headline with the picture of red tape in it, the form, the
  featured comparison's grid, the verdict, one proved item, the names of the authorities, how it works over four
  pictures, the figures in a sentence, the lawyer's questions, saved comparisons, the close, the footer.
- **A comparison `/comparisons/:id`.** The activity and the places at the top in the headline's manner. While
  running: the state in plain words and what has arrived so far, refreshing itself. When ready: the grid in
  full, each cell opening (a `details` element, no script) to its authority, renewal, ongoing filings, quote,
  link and check result; the verdict and figures; the lawyer's questions with a link to the sheet; the exports.
- **The sheet `/comparisons/:id/brief`**, **saved comparisons `/comparisons`**, **how it works `/how`**,
  **API `/api`**, **about `/about`** (the services with their calls and spend from the ledger, the limits, what
  is kept, the picture credits), not found.
- Exports: `/comparisons/:id.json` and `/comparisons/:id.csv` (one row per item: place, category, item,
  required, authority, fee, time, renewal, ongoing filings, official URL, quote, check result, checked at).

Honest states, in these words:

| Situation | The page says |
|---|---|
| A fee or time not on an official page | "not stated" |
| A category with no item for a place | "No item returned" |
| Research not in the layout | "This comparison did not finish: the research did not come back in the agreed layout. Nothing is shown." |
| Research too slow | "This comparison did not finish: TinyResearch took too long. Nothing is shown." |
| Daily limit reached | "Today's 2 new comparisons are used. Saved comparisons still open." |
| Visitor's limit reached | "You have started today's comparison from here already. Saved comparisons still open." |
| Spend stop reached | "New comparisons are closed: this demo has spent its budget. Saved comparisons still open." |
| The visitor cannot be counted (the salt is not set) | "New comparisons are closed for the moment. Saved comparisons still open." |

Every page that shows a comparison carries: "A starting point to confirm with a lawyer, not legal advice."

## 13. API

- `POST /api/comparisons` `{ activity, places: [a, b, c] }` → `202 { id, state, cached }`
- `GET /api/comparisons/:id` → the comparison: places, categories, items with every field and check result,
  figures, verdict, unclear rules
- `GET /api/comparisons/:id.csv`, `GET /api/comparisons` (saved ones), `GET /api/stats`
- `POST /admin/import` `{ run_id, activity, places }` with the admin token: adopts a finished TinyResearch run
  at no cost (the two demo runs of 9 November)

## 14. Stack

TypeScript (ESM, strict), Hono 4 with `hono/jsx`, one Cloudflare Worker, D1, static assets, a cron every minute,
Vitest in the Workers pool, Wrangler 4. The same versions and conventions as `../backed`, whose state machine,
slot, ledger, limits, visitor hash, exports and site shell are the model.

## 15. Not doing

No sign-in. No legal advice. No check of whether a person or business holds a licence. No currency conversion.
No more than three places in one comparison. No number is ever taken from a page that is not the item's own
official page.
