import { Hono } from "hono";
import { PUBLIC_COMPARISONS_PER_DAY, RESEARCH_BUDGET_USD, SPEND_STOP_USD } from "../core/limits";
import { spendByKind, totalSpend } from "../core/spend";
import { ALL, usedToday } from "../db/publicUse";
import type { Env } from "../env";
import { spendStopReached } from "../compare/money";

export const statsRouter = new Hono<{ Bindings: Env }>();

const money = (usd: number) => Math.round(usd * 1e4) / 1e4;

export async function readStats(db: D1Database, now: Date = new Date()) {
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM comparisons) AS comparisons,
         (SELECT COUNT(*) FROM comparisons WHERE state = 'ready') AS ready,
         (SELECT COUNT(*) FROM comparisons WHERE state = 'failed') AS failed,
         (SELECT COUNT(*) FROM comparisons WHERE state NOT IN ('ready', 'failed')) AS running`,
    )
    .first<Record<string, number>>();
  const by = await spendByKind(db);
  const spent = await totalSpend(db);
  const usedPublic = await usedToday(db, ALL, now);
  const watched = await db.prepare("SELECT COUNT(*) AS n FROM watches WHERE status = 'active'").first<{ n: number }>();
  return {
    comparisons: { total: counts?.comparisons ?? 0, ready: counts?.ready ?? 0, failed: counts?.failed ?? 0, running: counts?.running ?? 0 },
    spend_usd: money(spent),
    tinyfish: {
      research: { calls: by.research.rows, runs: by.research_run.rows, usd: money(by.research.usd + by.research_run.usd) },
      fetch: { calls: by.fetch.rows, usd: money(by.fetch.usd) },
      search: { calls: by.search.rows, usd: money(by.search.usd) },
      wallet: { calls: by.wallet.rows, usd: money(by.wallet.usd) },
      /** `checks`: reads of watched pages by a Monitor. `pages`: official pages watched now. */
      monitor: { checks: by.monitor_check.rows, usd: money(by.monitor_check.usd), pages: watched?.n ?? 0 },
    },
    limits: {
      spend_stop_usd: SPEND_STOP_USD,
      research_budget_usd: RESEARCH_BUDGET_USD,
      new_comparisons_open: !(await spendStopReached(db)),
      public_comparisons_today: usedPublic,
      public_comparisons_per_day: PUBLIC_COMPARISONS_PER_DAY,
    },
  };
}

statsRouter.get("/api/stats", async (c) => c.json(await readStats(c.env.DB)));

export type Stats = Awaited<ReturnType<typeof readStats>>;
