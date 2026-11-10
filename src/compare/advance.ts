// The state machine of a comparison. `advance(id)` moves it forward a little each time it is
// called and is safe to call twice at once: every step claims its work in one statement first.
//
//   queued      -> finding      the run slot is free and this is the oldest queued comparison.
//   finding     -> researching  one TinySearch per place, claimed first; government hosts kept,
//                               at most 6 each. After 10 minutes of failed searches the research
//                               goes on without preferred sites.
//   researching -> checking     the TinyResearch run is started (id stored before the first poll)
//                               then read once a minute (each poll claimed); more than 25 minutes
//                               without an end fails. A comparison that started a run is booked
//                               when it ends, including when it fails.
//   checking    -> ready        each item's official page is read, at most 4 per call; then a
//                               fee-lead search for items whose fee is not stated, at most 6.
//
// A research start is sent once. Only a plain refusal (a 4xx) clears its claim: a 429 is tried
// again for up to 20 minutes, any other 4xx fails the comparison with nothing booked. An answer
// that leaves the outcome open (a dropped connection, a 5xx, a 2xx without a run id) keeps the
// claim, so the start is never sent twice; the comparison then fails and the run is booked.
import {
  ADVANCE_BUDGET_MS,
  CHECKS_PER_ADVANCE,
  FEE_LEADS_PER_ADVANCE,
  FIND_CLAIM_STALE_MINUTES,
  FINDING_DEADLINE_MINUTES,
  FREE_RUNS_PER_DAY,
  LOST_START_MINUTES,
  READ_ATTEMPTS,
  READ_RETRY_AFTER_SECONDS,
  RESEARCH_BUDGET_USD,
  RESEARCH_POLL_EVERY_SECONDS,
  RESEARCH_TIMEOUT_MINUTES,
  SETTLE_AFTER_MINUTES,
  SITES_PER_PLACE,
  START_DEADLINE_MINUTES,
} from "../core/limits";
import { isGovernmentDomain } from "../core/official";
import { researchMinutes } from "../core/dates";
import { recordSpend } from "../core/spend";
import { hostOf, pickFeeLead } from "../brief/lead";
import { passingFailure, readOfficialPage } from "../check/read";
import { checkItem } from "../check/proof";
import type { Env } from "../env";
import { researchQuestion } from "../research/question";
import { parseReport } from "../research/report";
import { TinyFishError } from "../tinyfish/client";
import { getResearch, startResearch } from "../tinyfish/research";
import { searchWeb } from "../tinyfish/search";
import { readBalance } from "../tinyfish/wallet";
import { figuresOfPlaces } from "./figures";
import { spendStopReached } from "./money";
import { releaseSlot, renewSlot, takeSlot } from "./slot";
import {
  allItems,
  claimItem,
  claimLeadItem,
  getComparison,
  itemInserts,
  pendingItems,
  pendingLeads,
  placesOf,
  readAgainLater,
  saveFeeLead,
  saveItemCheck,
  type ComparisonRow,
} from "./store";

export type AdvanceResult = { state: string; did: string[] };

/** How many official pages may still be read. One call to `advance` has its own; the every-minute
 *  job shares one across every comparison it moves, so one run stays a small piece of work. */
export type ReadBudget = { reads: number };

const minutesAgo = (now: Date, iso: string | null) => (iso === null ? Infinity : (now.getTime() - Date.parse(iso)) / 60_000);
const round6 = (usd: number) => Math.round(usd * 1e6) / 1e6;
const EPS = 1e-9;
/** Refusals that say "not now": no run was created, and the start may be sent again. */
const TRY_LATER = new Set([408, 409, 425, 429]);

/** What a failed start call says about the run. "later" and "refused": TinyFish said no, so no run
 *  exists. "unknown": the request may have been accepted, so a run may exist. */
function startOutcome(err: unknown): "later" | "refused" | "unknown" {
  if (!(err instanceof TinyFishError)) return "unknown";
  if (TRY_LATER.has(err.status)) return "later";
  return err.status >= 400 && err.status < 500 ? "refused" : "unknown";
}

/** `s` must be the row as stored: a run may exist when it holds a run id, or a start claim. */
async function fail(env: Env, s: ComparisonRow, from: string, reason: string, now: Date): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE comparisons SET state = 'failed', failed_reason = ?, finished_at = ?,
       cost_basis = COALESCE(cost_basis, CASE WHEN research_run_id IS NULL AND research_started_at IS NULL THEN 'none' ELSE cost_basis END),
       cost_usd = COALESCE(cost_usd, CASE WHEN research_run_id IS NULL AND research_started_at IS NULL THEN 0 ELSE cost_usd END)
     WHERE id = ? AND state = ?`,
  )
    .bind(reason, now.toISOString(), s.id, from)
    .run();
  await releaseSlot(env.DB, s.id);
  if (r.meta.changes !== 1) return false;
  // A comparison that started a research run, or may have, is booked when it ends, including when it fails.
  const mayHaveRun = s.research_run_id !== null || s.research_started_at !== null;
  if (mayHaveRun && s.origin !== "import") await bookRun(env, s, now);
  return true;
}

async function start(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  const older = await env.DB.prepare(
    "SELECT 1 FROM comparisons WHERE state = 'queued' AND (created_at < ?1 OR (created_at = ?1 AND id < ?2)) LIMIT 1",
  )
    .bind(s.created_at, s.id)
    .first();
  if (older !== null) return;
  if (await spendStopReached(env.DB)) {
    if (await fail(env, s, "queued", "spend_stop", now)) did.push("failed:spend_stop");
    return;
  }
  if (!(await takeSlot(env.DB, s.id, now))) return;
  const claimed = await env.DB.prepare("UPDATE comparisons SET state = 'finding', started_at = ? WHERE id = ? AND state = 'queued'")
    .bind(now.toISOString(), s.id)
    .run();
  if (claimed.meta.changes !== 1) {
    await releaseSlot(env.DB, s.id);
    return;
  }
  did.push("finding");
}

async function find(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if (s.started_at !== null && minutesAgo(now, s.started_at) > FINDING_DEADLINE_MINUTES) {
    // The search has failed for too long. Preferred sites are a help, not a need: go on without them.
    const on = await env.DB.prepare("UPDATE comparisons SET state = 'researching' WHERE id = ? AND state = 'finding'").bind(s.id).run();
    if (on.meta.changes === 1) did.push("researching:no_sites");
    return;
  }
  const staleBefore = new Date(now.getTime() - FIND_CLAIM_STALE_MINUTES * 60_000).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE comparisons SET finding_claimed_at = ? WHERE id = ? AND state = 'finding'
       AND (finding_claimed_at IS NULL OR finding_claimed_at < ?)`,
  )
    .bind(now.toISOString(), s.id, staleBefore)
    .run();
  if (claimed.meta.changes !== 1) return;

  const places = placesOf(s);
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < places.length; i++) {
    const hits = await searchWeb(env, `${places[i]} official government business licence ${s.activity}`);
    const hosts: string[] = [];
    for (const h of hits) {
      let host: string;
      try {
        host = new URL(h.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (!isGovernmentDomain(host) || hosts.includes(host)) continue;
      hosts.push(host);
      if (hosts.length >= SITES_PER_PLACE) break;
    }
    for (const host of hosts) {
      statements.push(
        env.DB.prepare("INSERT OR IGNORE INTO place_sites (comparison_id, place_index, host) VALUES (?, ?, ?)").bind(s.id, i, host),
      );
    }
  }
  if (statements.length > 0) await env.DB.batch(statements);
  did.push("searched");
  const moved = await env.DB.prepare("UPDATE comparisons SET state = 'researching' WHERE id = ? AND state = 'finding'").bind(s.id).run();
  if (moved.meta.changes === 1) did.push("researching");
}

async function bookRun(env: Env, s: ComparisonRow, now: Date): Promise<void> {
  if (s.origin === "import") {
    await env.DB.prepare("UPDATE comparisons SET cost_usd = 0, cost_basis = 'import' WHERE id = ?").bind(s.id).run();
    await releaseSlot(env.DB, s.id);
    return;
  }
  let after: number | null = null;
  try {
    after = await readBalance(env);
  } catch {
    after = null;
  }
  const diff = s.wallet_before_usd !== null && after !== null ? round6(s.wallet_before_usd - after) : null;
  // The rate card: the first runs of a UTC day are free, the rest cost the budget. A run can be
  // charged after it ends, so an unchanged wallet makes a run free only when the rate card agrees.
  const startedAt = s.research_started_at ?? now.toISOString();
  const today = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comparisons WHERE origin <> 'import' AND research_started_at IS NOT NULL
       AND substr(research_started_at, 1, 10) = ? AND research_started_at <= ?`,
  )
    .bind(startedAt.slice(0, 10), startedAt)
    .first<{ n: number }>();
  const rateCard = (today?.n ?? 1) <= FREE_RUNS_PER_DAY ? 0 : RESEARCH_BUDGET_USD;
  let cost: number;
  let basis: string;
  if (diff === 0) {
    cost = rateCard;
    basis = rateCard === 0 ? "free" : "card";
  } else if (diff !== null && diff > 0 && diff <= RESEARCH_BUDGET_USD + EPS) {
    cost = diff;
    basis = "wallet";
  } else {
    cost = RESEARCH_BUDGET_USD;
    basis = "card";
  }
  const booked = await env.DB.prepare(
    "UPDATE comparisons SET wallet_after_usd = ?, cost_usd = ?, cost_basis = ?, run_booked_at = ? WHERE id = ? AND cost_basis IS NULL",
  )
    .bind(after, cost, basis, now.toISOString(), s.id)
    .run();
  if (booked.meta.changes === 1) await recordSpend(env.DB, "research_run", cost, s.id);
  await releaseSlot(env.DB, s.id);
}

async function startRun(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  // A claim with no run id is a start that was sent and whose outcome is not known: the Worker
  // stopped, the connection dropped, or the answer carried no id. It is never sent again. After
  // the limit the comparison fails, and the run is booked because TinyFish may have accepted it.
  if (s.research_started_at !== null) {
    if (minutesAgo(now, s.research_started_at) > LOST_START_MINUTES && (await fail(env, s, "researching", "research_failed", now))) {
      did.push("failed:research_failed");
    }
    return;
  }
  // A start that TinyFish has refused ever since the comparison began is given up. No run exists.
  if (s.started_at !== null && minutesAgo(now, s.started_at) > START_DEADLINE_MINUTES) {
    if (await fail(env, s, "researching", "research_failed", now)) did.push("failed:research_failed");
    return;
  }
  const claimed = await env.DB.prepare(
    `UPDATE comparisons SET research_started_at = ? WHERE id = ? AND state = 'researching' AND research_run_id IS NULL
       AND research_started_at IS NULL`,
  )
    .bind(now.toISOString(), s.id)
    .run();
  if (claimed.meta.changes !== 1) return;

  let before: number | null = null;
  try {
    before = await readBalance(env);
  } catch {
    before = null;
  }
  // Stored before the call, so a start that is lost can still be booked from the wallet.
  await env.DB.prepare("UPDATE comparisons SET wallet_before_usd = ? WHERE id = ?").bind(before, s.id).run();
  if (before !== null) await settleEarlierRuns(env, s.id, before, now);
  await renewSlot(env.DB, s.id, now);
  const { results: sites } = await env.DB.prepare("SELECT host FROM place_sites WHERE comparison_id = ?").bind(s.id).all<{ host: string }>();
  const domains = [...new Set(sites.map((r) => r.host))];
  try {
    const started = await startResearch(env, {
      query: researchQuestion(s.activity, placesOf(s)),
      mode: "deep",
      domainFilter: domains,
    });
    await env.DB.prepare("UPDATE comparisons SET research_run_id = ? WHERE id = ? AND research_run_id IS NULL").bind(started.id, s.id).run();
    did.push("started");
  } catch (err) {
    const outcome = startOutcome(err);
    if (outcome === "unknown") {
      did.push("start_unknown");
      return;
    }
    await env.DB.prepare("UPDATE comparisons SET research_started_at = NULL WHERE id = ? AND research_run_id IS NULL").bind(s.id).run();
    if (outcome === "later") {
      did.push("start_later");
      return;
    }
    if (await fail(env, { ...s, research_started_at: null }, "researching", "research_failed", now)) did.push("failed:research_failed");
  }
}

async function pollRun(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if (s.research_run_id === null) return;
  if (minutesAgo(now, s.research_started_at) > RESEARCH_TIMEOUT_MINUTES) {
    if (await fail(env, s, "researching", "timeout", now)) did.push("failed:timeout");
    return;
  }
  const due = new Date(now.getTime() - RESEARCH_POLL_EVERY_SECONDS * 1000).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE comparisons SET research_polled_at = ? WHERE id = ? AND state = 'researching'
       AND (research_polled_at IS NULL OR research_polled_at <= ?)`,
  )
    .bind(now.toISOString(), s.id, due)
    .run();
  if (claimed.meta.changes !== 1) return;
  let run;
  try {
    run = await getResearch(env, s.research_run_id);
  } catch (err) {
    if (!(err instanceof TinyFishError)) throw err;
    did.push(`poll_error:${err.code}`);
    return;
  }
  const status = run.status;
  const ended = status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT";
  if (ended || (status === "COMPLETED" && run.report === null)) {
    if (await fail(env, s, "researching", "research_failed", now)) did.push("failed:research_failed");
    return;
  }
  // QUEUED, RUNNING, or a word this reader does not know: the run is still going. Only the
  // 25-minute limit ends a run that never reports an end.
  if (status !== "COMPLETED" || run.report === null) return;
  const parsed = parseReport(run.report, placesOf(s));
  if (!parsed.ok) {
    if (await fail(env, s, "researching", "layout", now)) did.push("failed:layout");
    return;
  }
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE comparisons SET state = 'checking', dropped_items = ?, sources_count = ?, categories_json = ?, verdict_json = ?, unclear_json = ?, research_minutes = ?
       WHERE id = ? AND state = 'researching'`,
    ).bind(
      parsed.dropped,
      run.evidence.length,
      JSON.stringify(parsed.categories),
      JSON.stringify(parsed.verdict),
      JSON.stringify(parsed.unclear),
      researchMinutes(run.createdAt, run.completedAt),
      s.id,
    ),
    ...itemInserts(env.DB, s.id, parsed.places),
  ]);
  if (results[0]!.meta.changes !== 1) return;
  await bookRun(env, s, now);
  did.push("checking");
}

async function research(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if (s.research_run_id === null) await startRun(env, s, now, did);
  else await pollRun(env, s, now, did);
}

async function check(env: Env, s: ComparisonRow, now: Date, startedMs: number, budget: ReadBudget, did: string[]): Promise<void> {
  while (budget.reads > 0 && Date.now() - startedMs < ADVANCE_BUDGET_MS) {
    const item = await claimItem(env.DB, s.id, now);
    if (item === null) return;
    if (item.url === null || item.url === "") {
      await saveItemCheck(env.DB, item, "no_url", now);
      did.push(`no_url:${item.name}`);
      continue;
    }
    budget.reads--;
    const page = await readOfficialPage(env, item.url);
    if (!page.ok && passingFailure(page) && item.read_attempts + 1 < READ_ATTEMPTS) {
      await readAgainLater(env.DB, item, new Date(now.getTime() + READ_RETRY_AFTER_SECONDS * 1000));
      did.push(`read_again:${item.name}`);
      continue;
    }
    const date = now.toISOString().slice(0, 10);
    const result = checkItem({ quote: item.quote, fee: item.fee, url: item.url }, page.ok ? { ok: true, text: page.text } : { ok: false, error: page.error }, date);
    await saveItemCheck(env.DB, item, result.kind, now);
    did.push(`${result.kind}:${item.name}`);
  }
}

async function searchLeads(env: Env, s: ComparisonRow, now: Date, startedMs: number, did: string[]): Promise<void> {
  for (let n = 0; n < FEE_LEADS_PER_ADVANCE; n++) {
    if (Date.now() - startedMs >= ADVANCE_BUDGET_MS) return;
    const item = await claimLeadItem(env.DB, s.id, now);
    if (item === null) return;
    const host = item.host ?? (item.url !== null ? hostOf(item.url) : null);
    if (host === null) {
      await saveFeeLead(env.DB, item, null);
      did.push(`lead_none:${item.name}`);
      continue;
    }
    try {
      const hits = await searchWeb(env, `${item.name} fee schedule site:${host}`);
      await saveFeeLead(env.DB, item, pickFeeLead(hits, host));
      did.push(`lead:${item.name}`);
    } catch {
      await saveFeeLead(env.DB, item, null);
      did.push(`lead_none:${item.name}`);
    }
  }
}

async function finishChecking(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if ((await pendingItems(env.DB, s.id)) > 0) return;
  if ((await pendingLeads(env.DB, s.id)) > 0) return;
  const figures = figuresOfPlaces(placesOf(s), await allItems(env.DB, s.id));
  const r = await env.DB.prepare(
    `UPDATE comparisons SET state = 'ready', figures_json = ?, finished_at = ? WHERE id = ? AND state = 'checking'
       AND NOT EXISTS (SELECT 1 FROM items WHERE comparison_id = ? AND check_state IN ('unchecked', 'checking'))`,
  )
    .bind(JSON.stringify(figures), now.toISOString(), s.id, s.id)
    .run();
  if (r.meta.changes === 1) did.push("ready");
}

// Settling. Part of a run can be charged after it ends, so a booked cost is corrected once from a
// later wallet read. The read only says what this run cost while no other run has been started
// since: the wallet is one balance for every run. So a booked run is settled by whichever comes
// first: the balance read before the next run starts, or the every-minute job ten minutes on.

const UNSETTLED = "origin <> 'import' AND cost_basis IN ('wallet', 'card', 'free') AND cost_settled_at IS NULL";

const bookedAt = (s: ComparisonRow) => s.run_booked_at ?? s.finished_at;

/** True when another comparison's research start was sent after this run was booked. */
async function runStartedSince(db: D1Database, s: ComparisonRow, except: string | null): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS n FROM comparisons WHERE id <> ? AND id <> ? AND origin <> 'import' AND research_started_at > ? LIMIT 1")
    .bind(s.id, except ?? "", bookedAt(s) ?? "")
    .first<{ n: number }>();
  return row !== null;
}

/**
 * Marks a booked run settled, corrected from `balance` when there is one (null: the wallet can no
 * longer say what this run cost, and the booked cost stands). A balance further down than one run
 * costs holds other spending, so it can only bring the cost up to the rate card. A cost booked at
 * the rate card is lowered to what the wallet shows only when `mayLower`.
 */
async function settleFrom(env: Env, s: ComparisonRow, balance: number | null, mayLower: boolean, now: Date): Promise<number> {
  let cost = s.cost_usd ?? 0;
  let basis = s.cost_basis ?? "card";
  if (balance !== null && s.wallet_before_usd !== null) {
    const charged = round6(s.wallet_before_usd - balance);
    if (charged > RESEARCH_BUDGET_USD + EPS) {
      if (cost < RESEARCH_BUDGET_USD) {
        cost = RESEARCH_BUDGET_USD;
        basis = "card";
      }
    } else if (charged > cost + EPS) {
      cost = charged;
      basis = "wallet";
    } else if (mayLower && basis === "card" && charged >= 0 && charged < cost - EPS) {
      cost = charged;
      basis = charged === 0 ? "free" : "wallet";
    }
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE spend SET amount_usd = ?1 WHERE kind = 'research_run' AND ref = ?2
         AND EXISTS (SELECT 1 FROM comparisons WHERE id = ?2 AND cost_settled_at IS NULL)`,
    ).bind(cost, s.id),
    env.DB.prepare("UPDATE comparisons SET cost_usd = ?, cost_basis = ?, cost_settled_at = ? WHERE id = ? AND cost_settled_at IS NULL").bind(
      cost,
      basis,
      now.toISOString(),
      s.id,
    ),
  ]);
  return cost;
}

/** Called with the balance read just before a new run starts: the last read that holds only the
 *  runs before it. Every booked run not yet settled is settled from it. */
async function settleEarlierRuns(env: Env, startingId: string, balance: number, now: Date): Promise<void> {
  const { results } = await env.DB.prepare(`SELECT * FROM comparisons WHERE id <> ? AND ${UNSETTLED} AND wallet_before_usd IS NOT NULL`)
    .bind(startingId)
    .all<ComparisonRow>();
  for (const s of results) {
    const mixed = await runStartedSince(env.DB, s, startingId);
    const waited = minutesAgo(now, bookedAt(s)) >= SETTLE_AFTER_MINUTES;
    await settleFrom(env, s, mixed ? null : balance, waited, now);
  }
}

/** The every-minute job's part: settles the oldest run booked at least ten minutes ago. A wallet
 *  that cannot be read leaves the run unsettled, to be read again on the next minute. */
export async function settleRunCost(env: Env, now: Date = new Date()): Promise<{ id: string; cost: number } | null> {
  const due = new Date(now.getTime() - SETTLE_AFTER_MINUTES * 60_000).toISOString();
  const s = await env.DB.prepare(
    `SELECT * FROM comparisons WHERE ${UNSETTLED} AND COALESCE(run_booked_at, finished_at) <= ?
     ORDER BY COALESCE(run_booked_at, finished_at) LIMIT 1`,
  )
    .bind(due)
    .first<ComparisonRow>();
  if (s === null) return null;
  if (s.wallet_before_usd === null || (await runStartedSince(env.DB, s, null))) {
    return { id: s.id, cost: await settleFrom(env, s, null, false, now) };
  }
  let balance: number;
  try {
    balance = await readBalance(env);
  } catch {
    return { id: s.id, cost: s.cost_usd ?? 0 };
  }
  return { id: s.id, cost: await settleFrom(env, s, balance, true, now) };
}

export async function advance(
  env: Env,
  comparisonId: string,
  now: Date = new Date(),
  budget: ReadBudget = { reads: CHECKS_PER_ADVANCE },
): Promise<AdvanceResult> {
  const startedMs = Date.now();
  const did: string[] = [];
  let s = await getComparison(env.DB, comparisonId);
  if (s === null) return { state: "missing", did };
  // Without a key nothing can be asked of TinyFish: nothing moves, and nothing is failed for it.
  if (!env.TINYFISH_API_KEY) return { state: s.state, did: ["no_key"] };

  if (s.state === "queued") {
    await start(env, s, now, did);
    return { state: (await getComparison(env.DB, comparisonId))?.state ?? "missing", did };
  }
  if (s.state === "finding") {
    await find(env, s, now, did);
    s = (await getComparison(env.DB, comparisonId))!;
  }
  if (s.state === "researching") {
    await research(env, s, now, did);
    s = (await getComparison(env.DB, comparisonId))!;
  }
  if (s.state === "checking") {
    if ((await pendingItems(env.DB, s.id)) > 0) await check(env, s, now, startedMs, budget, did);
    else await searchLeads(env, s, now, startedMs, did);
    s = (await getComparison(env.DB, comparisonId))!;
    await finishChecking(env, s, now, did);
    s = (await getComparison(env.DB, comparisonId))!;
  }
  return { state: s.state, did };
}

export function advanceLater(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, comparisonId: string): void {
  ctx.waitUntil(
    advance(env, comparisonId).catch(() => {
      console.error("advance failed");
    }),
  );
}
