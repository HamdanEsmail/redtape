import { CHECK_CLAIM_STALE_MINUTES } from "../core/limits";
import type { CheckKind } from "../check/proof";
import type { ParsedItem } from "../research/report";

export type ComparisonState = "queued" | "finding" | "researching" | "checking" | "ready" | "failed";

export type ComparisonRow = {
  id: string;
  activity: string;
  places_json: string;
  reuse_key: string;
  origin: "public" | "admin" | "import";
  kept: number;
  demo: number | null;
  state: ComparisonState;
  failed_reason: string | null;
  research_run_id: string | null;
  research_started_at: string | null;
  wallet_before_usd: number | null;
  wallet_after_usd: number | null;
  cost_usd: number | null;
  cost_basis: string | null;
  run_booked_at: string | null;
  cost_settled_at: string | null;
  dropped_items: number;
  sources_count: number | null;
  categories_json: string | null;
  verdict_json: string | null;
  unclear_json: string | null;
  figures_json: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
  visitor_hash: string | null;
};

export type ItemRow = {
  id: string;
  comparison_id: string;
  place_index: number;
  category_n: number;
  name: string;
  required: string;
  authority: string;
  fee: string;
  time_to: string;
  renewal: string;
  ongoing: string;
  url: string | null;
  host: string | null;
  quote: string;
  check_state: "unchecked" | "checking" | "done";
  claimed_at: string | null;
  check_kind: CheckKind | null;
  checked_at: string | null;
  read_attempts: number;
  retry_at: string | null;
  fee_lead_json: string | null;
};

export function getComparison(db: D1Database, id: string): Promise<ComparisonRow | null> {
  return db.prepare("SELECT * FROM comparisons WHERE id = ?").bind(id).first<ComparisonRow>();
}

export function placesOf(row: ComparisonRow): string[] {
  return JSON.parse(row.places_json) as string[];
}

/**
 * Item inserts that only write when this batch is the one that moved the comparison to
 * `checking` (`changes() = 1` after that update, and the row is in `checking`).
 */
export function itemInserts(
  db: D1Database,
  comparisonId: string,
  places: { askedIndex: number; items: ParsedItem[] }[],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const p of places) {
    for (const i of p.items) {
      let host: string | null = null;
      if (i.url) {
        try {
          host = new URL(i.url).hostname.replace(/^www\./, "");
        } catch {
          host = null;
        }
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO items (id, comparison_id, place_index, category_n, name, required, authority, fee, time_to, renewal, ongoing, url, host, quote, check_state)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unchecked'
             WHERE changes() = 1
               AND EXISTS (SELECT 1 FROM comparisons WHERE id = ? AND state = 'checking')`,
          )
          .bind(
            crypto.randomUUID(),
            comparisonId,
            p.askedIndex,
            i.categoryN,
            i.name,
            i.required,
            i.authority,
            i.fee,
            i.timeTo,
            i.renewal,
            i.ongoing,
            i.url,
            host,
            i.quote,
            comparisonId,
          ),
      );
    }
  }
  return statements;
}

export async function claimItem(db: D1Database, comparisonId: string, now: Date): Promise<ItemRow | null> {
  const staleBefore = new Date(now.getTime() - CHECK_CLAIM_STALE_MINUTES * 60_000).toISOString();
  return db
    .prepare(
      `UPDATE items SET check_state = 'checking', claimed_at = ?1
       WHERE id = (SELECT id FROM items
                   WHERE comparison_id = ?2
                     AND ((check_state = 'unchecked' AND (retry_at IS NULL OR retry_at <= ?4))
                          OR (check_state = 'checking' AND claimed_at < ?3))
                   ORDER BY read_attempts, category_n, place_index LIMIT 1)
       RETURNING *`,
    )
    .bind(`${now.toISOString()}#${crypto.randomUUID()}`, comparisonId, staleBefore, now.toISOString())
    .first<ItemRow>();
}

export async function saveItemCheck(db: D1Database, claimed: ItemRow, kind: CheckKind, now: Date): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE items SET check_state = 'done', check_kind = ?, checked_at = ?
       WHERE id = ? AND claimed_at = ? AND check_state = 'checking'`,
    )
    .bind(kind, now.toISOString(), claimed.id, claimed.claimed_at)
    .run();
  return r.meta.changes === 1;
}

export async function readAgainLater(db: D1Database, claimed: ItemRow, retryAt: Date): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE items SET check_state = 'unchecked', read_attempts = read_attempts + 1, retry_at = ?
       WHERE id = ? AND claimed_at = ? AND check_state = 'checking'`,
    )
    .bind(retryAt.toISOString(), claimed.id, claimed.claimed_at)
    .run();
  return r.meta.changes === 1;
}

export async function pendingItems(db: D1Database, comparisonId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ? AND check_state IN ('unchecked', 'checking')")
    .bind(comparisonId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function allItems(db: D1Database, comparisonId: string): Promise<ItemRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM items WHERE comparison_id = ? ORDER BY place_index, category_n, name")
    .bind(comparisonId)
    .all<ItemRow>();
  return results;
}
