// Display rules for stored comparison data, as the approved home writes them.

import { isGap, type PlaceFigures } from "../compare/figures";
import type { ItemView } from "../compare/read";
import { NO_ITEM } from "../compare/words";

/** A value that is present and is not a "not stated" gap. */
export function stated(value: string): boolean {
  return value !== "" && !isGap(value);
}

/** Cut to at most `n` characters on a word boundary, with an ellipsis when cut. */
export function short(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/[\s,;:(]+\S*$/, "") + "…";
}

/** The place name up to a trailing parenthesis or comma: "Austin, Texas" → "Austin". */
export function shortPlace(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").replace(/,.*$/, "");
}

/** The short fee in a cell: "from USD 300", "free", or "not stated". */
export function feeShort(fee: string): string {
  if (!stated(fee)) return "not stated";
  if (/^(none|free|no fee)/i.test(fee)) return "free";
  const first = fee.split(/;| \(/)[0]!.trim();
  return (/;/.test(fee) && /[0-9]/.test(first) ? "from " : "") + short(first, 40);
}

/** The wait line in a cell. A gap is "wait not stated". */
export function waitShort(time: string): string {
  return stated(time) ? short(time, 60) : "wait not stated";
}

/** The longest-wait line under a place's tape. */
export function waitHead(time: string | null): string {
  return short(String(time ?? "not stated").split(/ \(|;/)[0]!.trim(), 44);
}

/** One piece of tape: red when the fee is stated and found, pale when stated but not, open when not stated. */
export function tapeClass(item: ItemView): "full" | "half" | "open" {
  if (!stated(item.fee)) return "open";
  return item.check_kind === "found" ? "full" : "half";
}

/** An http(s) address that may be a link; anything else is shown as text. */
export function safeHref(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url === "") return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The host of an address without "www."; the raw string when it is not a URL. */
export function hostOf(url: string | null | undefined): string {
  if (url === null || url === undefined || url === "") return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const FIGURE = /(?:£|S\$|\$|AED\s?)\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s?(?:AED|dirhams|working days|days|weeks|hours)/i;

/** The first amount or wait in a quote, to mark on the proved item. */
export function figureIn(quote: string): string | null {
  return quote.match(FIGURE)?.[0] ?? null;
}

/** Real items only: a missing category is not a piece of tape and not a requirement. */
export function realItems(items: ItemView[]): ItemView[] {
  return items.filter((i) => i.name !== NO_ITEM);
}

/** The proved item the home shows: a found fee with a long quoted amount, else any long quote. */
export function pickProved(items: ItemView[]): ItemView | null {
  const all = realItems(items);
  return (
    all.find((i) => i.check_kind === "found" && stated(i.fee) && i.quote.length > 40 && /\d/.test(i.quote)) ??
    all.find((i) => i.quote.length > 40) ??
    null
  );
}

/** Up to nine authority names, stripped of parentheses and lists. */
export function authoritiesOf(items: ItemView[]): string[] {
  const names = realItems(items)
    .map((i) =>
      i.authority
        .replace(/\s*\(.*?\)/g, "")
        .split(/[;,/]| and /)[0]!
        .trim(),
    )
    .filter((a) => a !== "" && a.length < 60 && !/not stated/i.test(a));
  return [...new Set(names)].slice(0, 9);
}

/** An unclear line as the home writes it: the place in bold, the rest after a dash or colon. */
export function unclearParts(line: string): { head: string; rest: string } {
  const [a, ...b] = line.split(/\s[–-]\s|:\s/);
  return {
    head: short(a ?? "", 60),
    rest: short(b.join(": ").replace(/https?:\/\/\S+/g, "").trim(), 230),
  };
}

/** "to <activity>?" for the headline; the empty home uses "to start a business?". */
export function toActivity(activity: string | null): string {
  if (activity === null || activity === "") return "to start a business?";
  return `to ${activity.replace(/\?+$/, "")}?`;
}

/** Letter count of the look's second line, "to open a cafe?". */
export const CAFE_CHARS = 15;

/** Average width of an Anton capital, in em. */
const ANTON_EM = 0.45;

/** Font size of a headline line of `chars` letters at a viewport, never larger than `display`. */
export function fitLine(viewport: number, margin: number, display: number, chars: number): number {
  const n = Math.max(chars, 1);
  return Math.min(display, (viewport - 2 * margin) / (n * ANTON_EM));
}

/** The first sentence of a verdict paragraph, as the verdict section shows it. */
export function firstSentence(paragraph: string): string {
  const shown = short(paragraph, 330);
  const cut = shown.search(/[.!?](?:\s|$)/);
  if (cut < 0) return shown;
  return shown.slice(0, cut + 1);
}

/** One place on a ready first screen when there is no verdict. */
export function placeAskLine(fig: PlaceFigures): string {
  const fees =
    fig.feesSum !== null ? fig.feesSum : fig.feesList !== null ? fig.feesList.join("; ") : "no stated fee";
  return `${shortPlace(fig.place)}: ${fig.feesStated} of ${fig.feesOf} fees stated, ${fees}, longest stated wait: ${waitHead(fig.longestWait)}.`;
}

/** The activity as a saved row writes it: first letter upper-case. */
export function savedActivity(activity: string): string {
  if (activity.length === 0) return activity;
  return activity[0]!.toUpperCase() + activity.slice(1);
}
