// Watching a saved comparison. Each official page whose fee was stated and found gets a TinyFish
// Page Monitor, 12 pages in all at most, read once a day. When a Monitor says its page changed,
// Redtape reads the page again itself and checks the items that rest on it: an item whose
// sentence is gone says so.
//
//   POST /admin/watch            lists the pages (rows in `watches`, status 'waiting').
//   the every-minute job         creates one Monitor in a run, claimed first, never sent twice;
//                                reads one changed page again in a run.
//   POST /hooks/monitor/:secret  one Monitor run. Booked once. A change marks the page to be read.
//
// Only Monitors created here, with their ids in `watches`, are ever read or deleted.
import { checkItem, type CheckKind } from "../check/proof";
import { passingFailure, readOfficialPage } from "../check/read";
import type { ReadBudget } from "../compare/advance";
import { figuresOfPlaces } from "../compare/figures";
import { allItems, getComparison, placesOf, type ItemRow } from "../compare/store";
import {
  PRICES,
  RECHECK_ATTEMPTS,
  RECHECK_RETRY_MINUTES,
  SPEND_STOP_USD,
  WATCH_CREATE_STALE_MINUTES,
  WATCH_HOUR_UTC,
  WATCH_PAGES_MAX,
} from "../core/limits";
import { recordSpend, totalSpend } from "../core/spend";
import type { Env } from "../env";
import { TinyFishError } from "../tinyfish/client";
import { createMonitor, deleteMonitor } from "../tinyfish/monitor";

export type WatchRow = {
  id: string;
  comparison_id: string;
  url: string;
  status: "waiting" | "creating" | "active" | "failed" | "unknown";
  claimed_at: string | null;
  monitor_id: string | null;
  created_at: string;
  last_run_at: string | null;
  last_outcome: string | null;
  recheck_due_at: string | null;
  recheck_tries: number;
};

const PURPOSE = "Tell me when the fee, the requirement or the waiting time stated on this official page changes.";
/** Refusals that say "not now": no Monitor was created, and the call may be sent again. */
const TRY_LATER = new Set([408, 409, 425, 429]);
const TRY_LATER_FOR_MINUTES = 60;

export type WatchResult = { ok: true; pages: number; added: number } | { ok: false; error: "not_found" | "not_saved" | "spend_stop" };

/** Lists the pages of a saved, ready comparison to watch: each official page with an item whose
 *  fee is stated and whose sentence was found. A page is added only while fewer than 12 are
 *  watched in all. No Monitor is created here. */
export async function watchComparison(env: Env, comparisonId: string, now: Date): Promise<WatchResult> {
  const s = await getComparison(env.DB, comparisonId);
  if (s === null) return { ok: false, error: "not_found" };
  if (s.kept !== 1 || s.state !== "ready") return { ok: false, error: "not_saved" };
  if ((await totalSpend(env.DB)) >= SPEND_STOP_USD) return { ok: false, error: "spend_stop" };
  const { results } = await env.DB.prepare(
    `SELECT url FROM items
     WHERE comparison_id = ? AND check_kind = 'found' AND url IS NOT NULL AND url <> '' AND lower(trim(fee)) NOT LIKE 'not stated%'
     GROUP BY url ORDER BY MIN(place_index), MIN(category_n), url`,
  )
    .bind(comparisonId)
    .all<{ url: string }>();
  let added = 0;
  for (const { url } of results) {
    const r = await env.DB.prepare(
      `INSERT INTO watches (id, comparison_id, url, status, created_at)
       SELECT ?1, ?2, ?3, 'waiting', ?4
       WHERE (SELECT COUNT(*) FROM watches) < ?5
         AND NOT EXISTS (SELECT 1 FROM watches WHERE comparison_id = ?2 AND url = ?3)`,
    )
      .bind(crypto.randomUUID(), comparisonId, url, now.toISOString(), WATCH_PAGES_MAX)
      .run();
    added += r.meta.changes;
  }
  const pages = await env.DB.prepare("SELECT COUNT(*) AS n FROM watches WHERE comparison_id = ?").bind(comparisonId).first<{ n: number }>();
  return { ok: true, pages: pages?.n ?? 0, added };
}

/** Stops watching a comparison: each Monitor is deleted by its own id, then its row. */
export async function unwatchComparison(env: Env, comparisonId: string): Promise<number> {
  const { results } = await env.DB.prepare("SELECT * FROM watches WHERE comparison_id = ?").bind(comparisonId).all<WatchRow>();
  let deleted = 0;
  for (const w of results) {
    if (w.monitor_id !== null) await deleteMonitor(env, w.monitor_id);
    await env.DB.prepare("DELETE FROM watches WHERE id = ?").bind(w.id).run();
    deleted++;
  }
  return deleted;
}

/** The minute of the hour a page is read at, from its row's id, so the Monitors do not all run at once. */
function minuteOf(id: string): number {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 60;
  return n;
}

/**
 * Creates the Monitor of one waiting page. The row is claimed first. A plain refusal marks it
 * 'failed' (a "not now" is tried again for an hour); an answer that leaves the outcome open (a
 * dropped connection, a 5xx, a 201 with no id) marks it 'unknown', and the call is never sent
 * again: a Monitor may exist, and a second one would be a second bill.
 */
export async function createNextMonitor(env: Env, now: Date): Promise<string | null> {
  const stale = new Date(now.getTime() - WATCH_CREATE_STALE_MINUTES * 60_000).toISOString();
  await env.DB.prepare("UPDATE watches SET status = 'unknown' WHERE status = 'creating' AND claimed_at < ?").bind(stale).run();
  const w = await env.DB.prepare(
    `UPDATE watches SET status = 'creating', claimed_at = ?
     WHERE id = (SELECT id FROM watches WHERE status = 'waiting' ORDER BY created_at, url LIMIT 1) AND status = 'waiting'
     RETURNING *`,
  )
    .bind(now.toISOString())
    .first<WatchRow>();
  if (w === null) return null;
  const set = (status: WatchRow["status"], monitorId: string | null = null) =>
    env.DB.prepare("UPDATE watches SET status = ?, monitor_id = ? WHERE id = ?").bind(status, monitorId, w.id).run();
  // Without its secret or its own address the hook cannot be called back.
  if (!env.WEBHOOK_SECRET || !env.PUBLIC_BASE_URL) {
    await set("failed");
    return w.id;
  }
  try {
    const { monitorId } = await createMonitor(env, {
      url: w.url,
      name: `redtape ${w.comparison_id} ${w.id.slice(0, 8)}`,
      scheduleCron: `${minuteOf(w.id)} ${WATCH_HOUR_UTC} * * *`,
      purpose: PURPOSE,
      webhookUrl: `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/hooks/monitor/${env.WEBHOOK_SECRET}`,
    });
    await set("active", monitorId);
  } catch (err) {
    if (!(err instanceof TinyFishError) || err.status < 400 || err.status >= 500) await set("unknown");
    else if (TRY_LATER.has(err.status) && (now.getTime() - Date.parse(w.created_at)) / 60_000 < TRY_LATER_FOR_MINUTES) await set("waiting");
    else await set("failed");
  }
  return w.id;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const ID = /^[A-Za-z0-9:_.-]{1,200}$/;
const OUTCOME = /^[a-z_]{1,32}$/;

/** The parts of a Monitor run Redtape reads, at the top level or under `run`. Anything that is
 *  not a short token is dropped. */
export function readMonitorPayload(data: unknown): { monitorId: string | null; runId: string | null; outcome: string | null } {
  const layers = [data, isRecord(data) ? data.run : undefined].filter(isRecord);
  const pick = (key: string): string | null => {
    for (const layer of layers) {
      const v = layer[key];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
    return null;
  };
  const monitorId = pick("fetch_monitor_id") ?? pick("monitor_id");
  const runId = pick("id");
  const outcome = pick("outcome")?.toLowerCase() ?? null;
  return {
    monitorId: monitorId !== null && ID.test(monitorId) ? monitorId : null,
    runId: runId !== null && ID.test(runId) ? runId : null,
    outcome: outcome !== null && OUTCOME.test(outcome) ? outcome : null,
  };
}

export type HookResult = { status: 400 | 404; body: { error: string } } | { status: 200; body: { ok: true; outcome?: string | null; duplicate?: true } };

/** One Monitor run (the secret was already checked). A run is booked once; a change marks the
 *  page to be read again by the every-minute job. */
export async function receiveMonitorRun(env: Env, data: unknown, now: Date): Promise<HookResult> {
  const p = readMonitorPayload(data);
  if (p.monitorId === null || p.runId === null) return { status: 400, body: { error: "invalid_payload" } };
  const w = await env.DB.prepare("SELECT * FROM watches WHERE monitor_id = ?").bind(p.monitorId).first<WatchRow>();
  if (w === null) return { status: 404, body: { error: "unknown_monitor" } };
  const first = await env.DB.prepare("INSERT OR IGNORE INTO monitor_runs (run_id, watch_id, outcome, received_at) VALUES (?, ?, ?, ?)")
    .bind(p.runId, w.id, p.outcome, now.toISOString())
    .run();
  if (first.meta.changes !== 1) return { status: 200, body: { ok: true, duplicate: true } };
  await recordSpend(env.DB, "monitor_check", PRICES.monitor_check, w.url);
  const changed = p.outcome === "changed" ? 1 : 0;
  await env.DB.prepare(
    `UPDATE watches SET last_run_at = ?1, last_outcome = ?2,
       recheck_due_at = CASE WHEN ?3 = 1 THEN ?1 ELSE recheck_due_at END,
       recheck_tries = CASE WHEN ?3 = 1 THEN 0 ELSE recheck_tries END
     WHERE id = ?4`,
  )
    .bind(now.toISOString(), p.outcome, changed, w.id)
    .run();
  return { status: 200, body: { ok: true, outcome: p.outcome } };
}

/**
 * Reads one changed page again and checks the items of its comparison that rest on it. An item
 * whose sentence was on the page before and is gone now becomes `page_changed`; one that is still
 * there keeps its result with the new day. A page that cannot be read is tried 3 times, 5 minutes
 * apart, then its items say the page could not be read. The place's figures are worked out again.
 */
export async function recheckChangedPage(env: Env, now: Date, budget: ReadBudget): Promise<string | null> {
  if (budget.reads <= 0) return null;
  const due = await env.DB.prepare("SELECT * FROM watches WHERE recheck_due_at IS NOT NULL AND recheck_due_at <= ? ORDER BY recheck_due_at LIMIT 1")
    .bind(now.toISOString())
    .first<WatchRow>();
  if (due === null) return null;
  // The claim: the time is pushed on in one statement, so a second run does not read the same page.
  const later = new Date(now.getTime() + RECHECK_RETRY_MINUTES * 60_000).toISOString();
  const claimed = await env.DB.prepare("UPDATE watches SET recheck_due_at = ? WHERE id = ? AND recheck_due_at = ?").bind(later, due.id, due.recheck_due_at).run();
  if (claimed.meta.changes !== 1) return null;

  budget.reads--;
  const page = await readOfficialPage(env, due.url);
  const tries = due.recheck_tries + 1;
  if (!page.ok && passingFailure(page) && tries < RECHECK_ATTEMPTS) {
    await env.DB.prepare("UPDATE watches SET recheck_tries = ? WHERE id = ?").bind(tries, due.id).run();
    return due.id;
  }

  const { results: items } = await env.DB.prepare("SELECT * FROM items WHERE comparison_id = ? AND url = ? AND check_state = 'done'")
    .bind(due.comparison_id, due.url)
    .all<ItemRow>();
  const date = now.toISOString().slice(0, 10);
  const statements: D1PreparedStatement[] = [];
  for (const it of items) {
    let kind: CheckKind;
    if (!page.ok) kind = "unreadable";
    else {
      const read = checkItem({ quote: it.quote, fee: it.fee, url: it.url }, { ok: true, text: page.text }, date).kind;
      const wasOnPage = it.check_kind === "found" || it.check_kind === "found_fee_missing" || it.check_kind === "page_changed";
      kind = read === "quote_missing" && wasOnPage ? "page_changed" : read;
    }
    statements.push(env.DB.prepare("UPDATE items SET check_kind = ?, checked_at = ? WHERE id = ?").bind(kind, now.toISOString(), it.id));
  }
  statements.push(env.DB.prepare("UPDATE watches SET recheck_due_at = NULL, recheck_tries = 0 WHERE id = ?").bind(due.id));
  await env.DB.batch(statements);

  const s = await getComparison(env.DB, due.comparison_id);
  if (s !== null) {
    const figures = figuresOfPlaces(placesOf(s), await allItems(env.DB, s.id));
    await env.DB.prepare("UPDATE comparisons SET figures_json = ? WHERE id = ?").bind(JSON.stringify(figures), s.id).run();
  }
  return due.id;
}

export type WatchView = { pages: number; last_run_at: string | null; urls: string[] };

/** What a comparison's page says about its watch: the pages with a live Monitor and the last run. Null when none. */
export async function watchOf(db: D1Database, comparisonId: string): Promise<WatchView | null> {
  const { results } = await db
    .prepare("SELECT url, last_run_at FROM watches WHERE comparison_id = ? AND status = 'active' ORDER BY url")
    .bind(comparisonId)
    .all<{ url: string; last_run_at: string | null }>();
  if (results.length === 0) return null;
  let last: string | null = null;
  for (const w of results) if (w.last_run_at !== null && (last === null || w.last_run_at > last)) last = w.last_run_at;
  return { pages: results.length, last_run_at: last, urls: results.map((w) => w.url) };
}
