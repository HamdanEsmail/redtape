// The job that runs every minute (wrangler.jsonc `* * * * *`): delete public comparisons past
// their time, move every unfinished comparison forward, so a comparison finishes even when nobody
// is watching its page, then correct one run's booked cost from a later wallet read. Each step
// runs even when an earlier one fails.
import type { Env } from "./env";
import { advance, settleRunCost, type ReadBudget } from "./compare/advance";
import { CHECKS_PER_ADVANCE } from "./core/limits";

const ADVANCE_PER_RUN = 5;

export interface CronResult {
  advanced: number;
  expired: number;
  failed_steps: string[];
}

export async function runCron(env: Env, now: Date = new Date()): Promise<CronResult> {
  const out: CronResult = { advanced: 0, expired: 0, failed_steps: [] };

  try {
    const { results } = await env.DB.prepare(
      "DELETE FROM comparisons WHERE expires_at IS NOT NULL AND expires_at < ? AND kept = 0 AND state IN ('ready', 'failed') RETURNING id",
    )
      .bind(now.toISOString())
      .all();
    out.expired = results.length;
  } catch {
    out.failed_steps.push("expire");
  }

  const { results } = await env.DB.prepare(
    "SELECT id FROM comparisons WHERE state NOT IN ('ready', 'failed') ORDER BY created_at, id LIMIT ?",
  )
    .bind(ADVANCE_PER_RUN)
    .all<{ id: string }>();
  // One run reads a few official pages in all, shared by every comparison being checked.
  const budget: ReadBudget = { reads: CHECKS_PER_ADVANCE };
  for (const { id } of results) {
    try {
      await advance(env, id, now, budget);
      out.advanced++;
    } catch {
      out.failed_steps.push(`advance:${id}`);
    }
  }
  try {
    await settleRunCost(env, now);
  } catch {
    out.failed_steps.push("settle");
  }
  if (out.failed_steps.length > 0) console.warn("cron", JSON.stringify(out));
  return out;
}
