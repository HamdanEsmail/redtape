// Daily counters behind the public limits. One row per (visitor hash, UTC day); the row whose hash
// is ALL counts every public comparison that day.

export const ALL = "all";

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function countIfUnder(db: D1Database, key: string, now: Date, limit: number): Promise<boolean> {
  if (limit < 1) return false;
  const row = await db
    .prepare(
      `INSERT INTO public_use (ip_hash, day, searches) VALUES (?1, ?2, 1)
       ON CONFLICT (ip_hash, day) DO UPDATE SET searches = searches + 1 WHERE searches < ?3
       RETURNING searches`,
    )
    .bind(key, utcDay(now), limit)
    .first<{ searches: number }>();
  return row !== null;
}

export async function uncount(db: D1Database, key: string, now: Date): Promise<void> {
  await db.prepare("UPDATE public_use SET searches = MAX(0, searches - 1) WHERE ip_hash = ? AND day = ?").bind(key, utcDay(now)).run();
}

export async function usedToday(db: D1Database, key: string, now: Date): Promise<number> {
  const row = await db.prepare("SELECT searches FROM public_use WHERE ip_hash = ? AND day = ?").bind(key, utcDay(now)).first<{ searches: number }>();
  return row?.searches ?? 0;
}
