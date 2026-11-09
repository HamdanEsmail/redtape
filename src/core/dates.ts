// Days shown to a person, and the research run's duration in whole minutes.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A UTC day as "9 Nov 2026". Used wherever a checked date goes into words. */
export function shownDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole minutes between a run's created_at and completed_at, rounded. Null when either is missing. */
export function researchMinutes(createdAt: string | null, completedAt: string | null): number | null {
  if (createdAt === null || completedAt === null) return null;
  const a = Date.parse(createdAt);
  const b = Date.parse(completedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 60_000);
}
