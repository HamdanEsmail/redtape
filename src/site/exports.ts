// The CSV export: one row per item. Text a spreadsheet would run as a formula is kept as text
// by a leading apostrophe. JSON is the comparison as the API returns it.
import type { ComparisonView } from "../compare/read";
import { NO_ITEM } from "../compare/words";

export const CSV_COLUMNS = [
  "place",
  "category",
  "item",
  "required",
  "authority",
  "fee",
  "time",
  "renewal",
  "ongoing filings",
  "official URL",
  "quote",
  "check result",
  "checked at",
] as const;

/** One cell. Text that a spreadsheet would run as a formula (=, +, -, @, a tab or a carriage
 *  return at its start) is kept as text by a leading apostrophe; a cell with a comma, a quote or
 *  a line break is quoted. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A file name from the activity: letters and digits, hyphens for the rest. */
export function fileSlug(activity: string): string {
  const slug = activity
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug === "" ? "comparison" : slug;
}

export function downloadName(activity: string, ext: "csv" | "json"): string {
  return `redtape-${fileSlug(activity)}.${ext}`;
}

export function comparisonCsv(view: ComparisonView): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const item of view.items.filter((i) => i.name !== NO_ITEM)) {
    const row: (string | null)[] = [
      item.place,
      item.category,
      item.name,
      item.required,
      item.authority,
      item.fee,
      item.time,
      item.renewal,
      item.ongoing,
      item.url,
      item.quote,
      item.check_result,
      item.checked_at,
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
