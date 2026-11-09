// The state machine of a comparison. `advance(id)` moves it forward a little each time it is
// called and is safe to call twice at once: every step claims its work in one statement first.
//
//   queued      -> finding      the run slot is free and this is the oldest queued comparison.
//   finding     -> researching  one TinySearch per place; government hosts kept, at most 6 each.
//   researching -> checking     the TinyResearch run is started (id stored before the first poll)
//                               then read once a minute; more than 25 minutes without an end fails.
//   checking    -> ready        each item's official page is read, at most 4 per call.
import {
  ADVANCE_BUDGET_MS,
  CHECKS_PER_ADVANCE,
  READ_ATTEMPTS,
  READ_RETRY_AFTER_SECONDS,
  RESEARCH_BUDGET_USD,
  RESEARCH_TIMEOUT_MINUTES,
  SETTLE_AFTER_MINUTES,
  SITES_PER_PLACE,
} from "../core/limits";
import { isGovernmentDomain } from "../core/official";
import { recordSpend } from "../core/spend";
import { passingFailure, readOfficialPage } from "../check/read";
import { checkItem } from "../check/proof";
import type { Env } from "../env";
import { researchQuestion } from "../research/question";
import { parseReport } from "../research/report";
import { TinyFishError } from "../tinyfish/client";
import { getResearch, startResearch } from "../tinyfish/research";
import { searchWeb } from "../tinyfish/search";
import { readBalance } from "../tinyfish/wallet";
import { figuresForPlace } from "./figures";
import { spendStopReached } from "./money";
import { releaseSlot, takeSlot } from "./slot";
import {
  allItems,
  claimItem,
  getComparison,
  itemInserts,
  pendingItems,
  placesOf,
  readAgainLater,
  saveItemCheck,
  type ComparisonRow,
} from "./store";

export type AdvanceResult = { state: string; did: string[] };

const minutesAgo = (now: Date, iso: string | null) => (iso === null ? Infinity : (now.getTime() - Date.parse(iso)) / 60_000);
const LOST_START_MINUTES = 5;
const RETRY_LATER = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

async function fail(env: Env, s: ComparisonRow, from: string, reason: string, now: Date): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE comparisons SET state = 'failed', failed_reason = ?, finished_at = ?,
       cost_basis = COALESCE(cost_basis, CASE WHEN research_run_id IS NULL THEN 'none' ELSE cost_basis END),
       cost_usd = COALESCE(cost_usd, CASE WHEN research_run_id IS NULL THEN 0 ELSE cost_usd END)
     WHERE id = ? AND state = ?`,
  )
    .bind(reason, now.toISOString(), s.id, from)
    .run();
  await releaseSlot(env.DB, s.id);
  return r.meta.changes === 1;
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
  const places = placesOf(s);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM place_sites WHERE comparison_id = ?").bind(s.id).first<{ n: number }>();
  if ((existing?.n ?? 0) === 0) {
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
  }
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
  const diff =
    s.wallet_before_usd !== null && after !== null ? Math.round((s.wallet_before_usd - after) * 1e6) / 1e6 : null;
  let cost: number;
  let basis: string;
  if (diff === 0) {
    cost = 0;
    basis = "free";
  } else if (diff !== null && diff > 0 && diff <= RESEARCH_BUDGET_USD + 1e-9) {
    cost = diff;
    basis = "wallet";
  } else {
    cost = RESEARCH_BUDGET_USD;
    basis = "card";
  }
  await recordSpend(env.DB, "research_run", cost, s.id);
  await env.DB.prepare("UPDATE comparisons SET wallet_after_usd = ?, cost_usd = ?, cost_basis = ?, run_booked_at = ? WHERE id = ?")
    .bind(after, cost, basis, now.toISOString(), s.id)
    .run();
  await releaseSlot(env.DB, s.id);
}

async function startRun(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  const claimed = await env.DB.prepare(
    `UPDATE comparisons SET research_started_at = ? WHERE id = ? AND state = 'researching' AND research_run_id IS NULL
       AND (research_started_at IS NULL OR research_started_at < ?)`,
  )
    .bind(now.toISOString(), s.id, new Date(now.getTime() - LOST_START_MINUTES * 60_000).toISOString())
    .run();
  if (claimed.meta.changes !== 1) return;

  let before: number | null = null;
  try {
    before = await readBalance(env);
  } catch {
    before = null;
  }
  const { results: sites } = await env.DB.prepare("SELECT host FROM place_sites WHERE comparison_id = ?").bind(s.id).all<{ host: string }>();
  const domains = [...new Set(sites.map((r) => r.host))];
  try {
    const started = await startResearch(env, {
      query: researchQuestion(s.activity, placesOf(s)),
      mode: "deep",
      domainFilter: domains,
    });
    await env.DB.prepare("UPDATE comparisons SET research_run_id = ?, wallet_before_usd = ? WHERE id = ? AND research_run_id IS NULL")
      .bind(started.id, before, s.id)
      .run();
    did.push("started");
  } catch (err) {
    const retry = !(err instanceof TinyFishError) || RETRY_LATER.has(err.status);
    if (retry) {
      await env.DB.prepare("UPDATE comparisons SET research_started_at = NULL WHERE id = ? AND research_run_id IS NULL").bind(s.id).run();
      did.push("start_later");
    } else {
      await fail(env, { ...s, state: "researching" }, "researching", "research_failed", now);
      did.push("failed:research_failed");
    }
  }
}

async function pollRun(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if (s.research_run_id === null) return;
  if (minutesAgo(now, s.research_started_at) > RESEARCH_TIMEOUT_MINUTES) {
    if (await fail(env, s, "researching", "timeout", now)) did.push("failed:timeout");
    return;
  }
  let run;
  try {
    run = await getResearch(env, s.research_run_id);
  } catch (err) {
    if (!(err instanceof TinyFishError)) throw err;
    did.push(`poll_error:${err.code}`);
    return;
  }
  const status = run.status;
  if (status === "QUEUED" || status === "RUNNING") return;
  if (status !== "COMPLETED" || run.report === null) {
    if (await fail(env, s, "researching", "research_failed", now)) did.push("failed:research_failed");
    return;
  }
  const parsed = parseReport(run.report, placesOf(s));
  if (!parsed.ok) {
    if (await fail(env, s, "researching", "layout", now)) did.push("failed:layout");
    return;
  }
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE comparisons SET state = 'checking', dropped_items = ?, sources_count = ?, categories_json = ?, verdict_json = ?, unclear_json = ?
       WHERE id = ? AND state = 'researching'`,
    ).bind(parsed.dropped, run.evidence.length, JSON.stringify(parsed.categories), JSON.stringify(parsed.verdict), JSON.stringify(parsed.unclear), s.id),
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

async function check(env: Env, s: ComparisonRow, now: Date, startedMs: number, did: string[]): Promise<void> {
  let reads = 0;
  while (reads < CHECKS_PER_ADVANCE && Date.now() - startedMs < ADVANCE_BUDGET_MS) {
    const item = await claimItem(env.DB, s.id, now);
    if (item === null) return;
    if (item.url === null || item.url === "") {
      await saveItemCheck(env.DB, item, "no_url", now);
      did.push(`no_url:${item.name}`);
      continue;
    }
    reads++;
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

async function finishChecking(env: Env, s: ComparisonRow, now: Date, did: string[]): Promise<void> {
  if ((await pendingItems(env.DB, s.id)) > 0) return;
  const items = await allItems(env.DB, s.id);
  const places = placesOf(s);
  const figures = places.map((place, i) =>
    figuresForPlace(
      place,
      items.filter((it) => it.place_index === i).map((it) => ({ required: it.required, fee: it.fee, timeTo: it.time_to, checkKind: it.check_kind ?? "" })),
    ),
  );
  const r = await env.DB.prepare(
    `UPDATE comparisons SET state = 'ready', figures_json = ?, finished_at = ? WHERE id = ? AND state = 'checking'
       AND NOT EXISTS (SELECT 1 FROM items WHERE comparison_id = ? AND check_state IN ('unchecked', 'checking'))`,
  )
    .bind(JSON.stringify(figures), now.toISOString(), s.id, s.id)
    .run();
  if (r.meta.changes === 1) did.push("ready");
}

export async function settleRunCost(env: Env, now: Date = new Date()): Promise<{ id: string; cost: number } | null> {
  const due = new Date(now.getTime() - SETTLE_AFTER_MINUTES * 60_000).toISOString();
  const s = await env.DB.prepare(
    `UPDATE comparisons SET cost_settled_at = ? WHERE id = (
       SELECT id FROM comparisons WHERE origin <> 'import' AND cost_basis IN ('wallet', 'card', 'free') AND cost_settled_at IS NULL
         AND COALESCE(run_booked_at, finished_at) <= ? ORDER BY COALESCE(run_booked_at, finished_at) LIMIT 1)
     AND cost_settled_at IS NULL RETURNING *`,
  )
    .bind(now.toISOString(), due)
    .first<ComparisonRow>();
  if (s === null || s.wallet_before_usd === null) return null;
  const booked = s.run_booked_at ?? s.finished_at!;
  const later = await env.DB.prepare(
    "SELECT 1 AS later FROM comparisons WHERE id <> ? AND origin <> 'import' AND research_run_id IS NOT NULL AND started_at > ? LIMIT 1",
  )
    .bind(s.id, booked)
    .first<{ later: number }>();
  if (later !== null) return { id: s.id, cost: s.cost_usd ?? 0 };
  let balance: number;
  try {
    balance = await readBalance(env);
  } catch {
    return { id: s.id, cost: s.cost_usd ?? 0 };
  }
  const total = Math.round((s.wallet_before_usd - balance) * 1e6) / 1e6;
  if (!(total > (s.cost_usd ?? 0) && total <= RESEARCH_BUDGET_USD + 1e-9)) return { id: s.id, cost: s.cost_usd ?? 0 };
  await env.DB.batch([
    env.DB.prepare("UPDATE spend SET amount_usd = ? WHERE kind = 'research_run' AND ref = ?").bind(total, s.id),
    env.DB.prepare("UPDATE comparisons SET cost_usd = ?, cost_basis = 'wallet' WHERE id = ?").bind(total, s.id),
  ]);
  return { id: s.id, cost: total };
}

export async function advance(env: Env, comparisonId: string, now: Date = new Date()): Promise<AdvanceResult> {
  const startedMs = Date.now();
  const did: string[] = [];
  let s = await getComparison(env.DB, comparisonId);
  if (s === null) return { state: "missing", did };

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
    await check(env, s, now, startedMs, did);
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
