// The spend ledger. Every TinyFish call appends one row (free calls at $0), and every finished
// TinyResearch run appends one `research_run` row with what the run cost. The totals feed the
// spend stop (SPEND_STOP_USD) and the public /api/stats.

/**
 * - `research`: a TinyResearch API call (start, read); $0, the run is booked when it ends.
 * - `research_run`: what one TinyResearch run cost. Not a call: one row per finished run.
 * - `fetch`, `search`: a TinyFetch or TinySearch call.
 * - `wallet`: a wallet balance read.
 * - `monitor_check`: one read of a watched page by a TinyFish Monitor.
 */
export type SpendKind = "research" | "research_run" | "fetch" | "search" | "wallet" | "monitor_check";

export const SPEND_KINDS: readonly SpendKind[] = ["research", "research_run", "fetch", "search", "wallet", "monitor_check"];

/** Appends one row. `ref` says what it was for (a run id, a comparison id, a page's address). */
export async function recordSpend(db: D1Database, kind: SpendKind, amountUsd: number, ref: string): Promise<void> {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error(`spend amount must be a non-negative number (${kind})`);
  await db
    .prepare("INSERT INTO spend (id, kind, amount_usd, ref, at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), kind, amountUsd, ref, new Date().toISOString())
    .run();
}

/** Total US dollars spent so far, across every kind. */
export async function totalSpend(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(amount_usd), 0) AS total FROM spend").first<{ total: number }>();
  return row?.total ?? 0;
}

/** US dollars and rows per kind. Every kind is present, at zero when it has no rows. */
export async function spendByKind(db: D1Database): Promise<Record<SpendKind, { usd: number; rows: number }>> {
  const out = Object.fromEntries(SPEND_KINDS.map((k) => [k, { usd: 0, rows: 0 }])) as Record<SpendKind, { usd: number; rows: number }>;
  const { results } = await db
    .prepare("SELECT kind, COALESCE(SUM(amount_usd), 0) AS usd, COUNT(*) AS rows FROM spend GROUP BY kind")
    .all<{ kind: string; usd: number; rows: number }>();
  for (const r of results) {
    if (Object.hasOwn(out, r.kind)) out[r.kind as SpendKind] = { usd: r.usd, rows: r.rows };
  }
  return out;
}
