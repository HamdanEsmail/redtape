// The one comparison allowed to run a TinyResearch at a time. One D1 row holds the comparison and
// since when; a holder older than RUN_SLOT_STALE_MINUTES no longer blocks.
import { RUN_SLOT_STALE_MINUTES } from "../core/limits";

export async function takeSlot(db: D1Database, comparisonId: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - RUN_SLOT_STALE_MINUTES * 60_000).toISOString();
  const r = await db
    .prepare("UPDATE run_slot SET comparison_id = ?, since = ? WHERE id = 1 AND (comparison_id IS NULL OR since < ?)")
    .bind(comparisonId, now.toISOString(), staleBefore)
    .run();
  return r.meta.changes === 1;
}

/** Starts the holder's clock again. Called when its research start is sent, so the slot is held
 *  for the whole run however long finding the sites took. */
export async function renewSlot(db: D1Database, comparisonId: string, now: Date): Promise<void> {
  await db.prepare("UPDATE run_slot SET since = ? WHERE id = 1 AND comparison_id = ?").bind(now.toISOString(), comparisonId).run();
}

export async function releaseSlot(db: D1Database, comparisonId: string): Promise<boolean> {
  const r = await db.prepare("UPDATE run_slot SET comparison_id = NULL, since = NULL WHERE id = 1 AND comparison_id = ?").bind(comparisonId).run();
  return r.meta.changes === 1;
}

export function readSlot(db: D1Database): Promise<{ comparison_id: string | null; since: string | null } | null> {
  return db.prepare("SELECT comparison_id, since FROM run_slot WHERE id = 1").first();
}
