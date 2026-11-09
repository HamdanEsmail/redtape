import { researchMinutes } from "../core/dates";
import { PUBLIC_COMPARISONS_PER_DAY, PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY, PUBLIC_TTL_DAYS, REUSE_DAYS } from "../core/limits";
import { ALL, countIfUnder, uncount } from "../db/publicUse";
import type { Env } from "../env";
import { parseReport } from "../research/report";
import { TinyFishError } from "../tinyfish/client";
import { getResearch } from "../tinyfish/research";
import { checkInput, reuseKey, type ComparisonInput } from "./input";
import { spendStopReached } from "./money";
import { itemInserts, type ComparisonState } from "./store";
import { DAILY_LIMIT, SPEND_STOP, VISITOR_LIMIT } from "./words";

const DAY_MS = 86_400_000;

export type StartResult =
  | { ok: true; id: string; state: ComparisonState; cached: boolean }
  | { ok: false; error: "spend_stop" | "daily_limit" | "visitor_limit"; message: string };

export function newComparisonId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function findReusable(db: D1Database, input: ComparisonInput, now: Date): Promise<{ id: string; state: ComparisonState } | null> {
  const since = new Date(now.getTime() - REUSE_DAYS * DAY_MS).toISOString();
  return db
    .prepare("SELECT id, state FROM comparisons WHERE reuse_key = ? AND created_at >= ? AND state <> 'failed' ORDER BY created_at DESC LIMIT 1")
    .bind(reuseKey(input.activity, input.places), since)
    .first<{ id: string; state: ComparisonState }>();
}

async function insertQueued(
  db: D1Database,
  input: ComparisonInput,
  origin: "public" | "admin",
  demo: number | null,
  visitor: string | null,
  now: Date,
): Promise<string> {
  const id = newComparisonId();
  const kept = demo !== null ? 1 : 0;
  const expires = origin === "public" && kept === 0 ? new Date(now.getTime() + PUBLIC_TTL_DAYS * DAY_MS).toISOString() : null;
  await db
    .prepare(
      `INSERT INTO comparisons (id, activity, places_json, reuse_key, origin, kept, demo, state, created_at, expires_at, visitor_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    )
    .bind(id, input.activity, JSON.stringify(input.places), reuseKey(input.activity, input.places), origin, kept, demo, now.toISOString(), expires, visitor)
    .run();
  return id;
}

export async function startPublicComparison(env: Env, input: ComparisonInput, visitor: string, now: Date): Promise<StartResult> {
  const reused = await findReusable(env.DB, input, now);
  if (reused !== null) return { ok: true, id: reused.id, state: reused.state, cached: true };
  if (await spendStopReached(env.DB)) return { ok: false, error: "spend_stop", message: SPEND_STOP };
  if (!(await countIfUnder(env.DB, ALL, now, PUBLIC_COMPARISONS_PER_DAY))) return { ok: false, error: "daily_limit", message: DAILY_LIMIT };
  if (!(await countIfUnder(env.DB, visitor, now, PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY))) {
    await uncount(env.DB, ALL, now);
    return { ok: false, error: "visitor_limit", message: VISITOR_LIMIT };
  }
  const id = await insertQueued(env.DB, input, "public", null, visitor, now);
  return { ok: true, id, state: "queued", cached: false };
}

export async function startAdminComparison(env: Env, input: ComparisonInput, demo: number | null, now: Date): Promise<StartResult> {
  if (await spendStopReached(env.DB)) return { ok: false, error: "spend_stop", message: SPEND_STOP };
  const id = await insertQueued(env.DB, input, "admin", demo, null, now);
  return { ok: true, id, state: "queued", cached: false };
}

export { checkInput };

/**
 * Adopts a finished TinyResearch run at no cost. The comparison starts at `checking` with the
 * report already read into items.
 */
export async function importComparison(env: Env, runId: string, input: ComparisonInput, demo: number | null, now: Date): Promise<string> {
  const run = await getResearch(env, runId);
  if (run.status !== "COMPLETED" || run.report === null) throw new TinyFishError(502, "run_unreadable", "TinyFish returned a research run that is not finished");
  const parsed = parseReport(run.report, input.places);
  if (!parsed.ok) throw new TinyFishError(502, "layout", "the research did not come back in the agreed layout");
  const id = newComparisonId();
  const kept = demo !== null ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO comparisons (id, activity, places_json, reuse_key, origin, kept, demo, state, research_run_id, cost_usd, cost_basis,
         dropped_items, sources_count, categories_json, verdict_json, unclear_json, research_minutes, created_at, started_at)
       VALUES (?, ?, ?, ?, 'import', ?, ?, 'checking', ?, 0, 'import', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      input.activity,
      JSON.stringify(input.places),
      reuseKey(input.activity, input.places),
      kept,
      demo,
      runId,
      parsed.dropped,
      run.evidence.length,
      JSON.stringify(parsed.categories),
      JSON.stringify(parsed.verdict),
      JSON.stringify(parsed.unclear),
      researchMinutes(run.createdAt, run.completedAt),
      now.toISOString(),
      now.toISOString(),
    ),
    ...itemInserts(env.DB, id, parsed.places),
  ]);
  return id;
}
