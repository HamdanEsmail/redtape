// The quote check and the amount check. Text is compared after lower-casing, removing punctuation
// and collapsing spaces. A page that could not be read is not a page that lacks the sentence.
import { shownDate } from "../core/dates";

export type PageRead = { ok: true; text: string } | { ok: false; error: string } | null;

export type CheckKind = "found" | "found_fee_missing" | "quote_missing" | "unreadable" | "no_url";

export type CheckResult = { kind: CheckKind; text: string };

/** The words of a text: runs of letters and digits, lower-cased. Everything else separates them. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Longest run of the quote's words, in order and unbroken, that is on the page. One pass over the
 * page: at each page word, only the places where the quote has that same word are looked at, so a
 * long page costs its length and not its length times the quote's.
 */
function longestCommonRun(quote: string[], page: string[]): number {
  const placesOf = new Map<string, number[]>();
  quote.forEach((word, i) => {
    const places = placesOf.get(word);
    if (places === undefined) placesOf.set(word, [i]);
    else places.push(i);
  });
  // before[i + 1]: the length of the run that ends at quote[i] and at the page word before this one.
  let before = new Uint32Array(quote.length + 1);
  let now = new Uint32Array(quote.length + 1);
  let live = false;
  let best = 0;
  for (const word of page) {
    const places = placesOf.get(word);
    if (places === undefined) {
      if (live) {
        before.fill(0);
        live = false;
      }
      continue;
    }
    for (const i of places) {
      const n = before[i]! + 1;
      now[i + 1] = n;
      if (n > best) best = n;
    }
    if (best === quote.length) return best;
    [before, now] = [now, before];
    now.fill(0);
    live = true;
  }
  return best;
}

/**
 * The parts of the page where a run of `need` of the quote's words could be, each as its words.
 *
 * A run that long cannot miss the middle of the quote: of `q` words, every run of `need` holds the
 * words from `q - need` to `need - 1` (`need` is always more than half of `q`). So the page is
 * only read around the places where the longest of those words appears, far enough each way to
 * hold the whole quote three times over. A page without that word has no such run. What this
 * costs depends on the quote and on how often the word appears, not on how long the page is.
 */
function partsNearQuote(q: string[], need: number, page: string): string[][] {
  const lower = page.toLowerCase();
  let anchor = q[need - 1]!;
  for (let i = q.length - need; i < need; i++) if (q[i]!.length > anchor.length) anchor = q[i]!;
  const reach = 3 * q.reduce((n, word) => n + word.length + 1, 0) + 400;
  const spans: [number, number][] = [];
  for (let at = lower.indexOf(anchor); at !== -1; at = lower.indexOf(anchor, at + anchor.length)) {
    const from = Math.max(0, at - reach);
    const to = Math.min(lower.length, at + anchor.length + reach);
    const last = spans[spans.length - 1];
    if (last !== undefined && from <= last[1]) last[1] = to;
    else spans.push([from, to]);
  }
  return spans.map(([from, to]) => {
    const words = wordsOf(lower.slice(from, to));
    // A word cut by the edge of a part is not a word of the page.
    if (from > 0) words.shift();
    if (to < lower.length) words.pop();
    return words;
  });
}

/** True when a run of the quote's words, in order, is on the page: at least 8 words (or the whole
 *  quote, when shorter) and at least 60% of the quote's words. */
export function quoteFound(quote: string, page: string): boolean {
  const q = wordsOf(quote);
  if (q.length === 0) return false;
  const need = Math.max(q.length < 8 ? q.length : 8, Math.ceil(q.length * 0.6));
  for (const part of partsNearQuote(q, need, page)) {
    if (longestCommonRun(q, part) >= need) return true;
  }
  return false;
}

const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
/** A currency written as a code or a word. */
const CURRENCY_WORD = "\\b(?:USD|SGD|AED|GBP|EUR|Singapore\\s+dollars?|dirhams?|dollars?|pounds?|euros?)\\b";
/** A currency written as a sign, a code or a word. */
const CURRENCY_MARK = `US\\$|S\\$|\\$|£|€|${CURRENCY_WORD}`;
/** A number with its currency: the mark first ("USD 600", "£50") or a code or word after ("600 dirhams"). */
const AMOUNT = new RegExp(`(${CURRENCY_MARK})[.:]?\\s*(${NUMBER})|(?<![\\d.,])(${NUMBER})\\s*\\(?(${CURRENCY_WORD})`, "i");
const ANY_MARK = new RegExp(CURRENCY_MARK, "i");
/** A fee that begins with a number: "300", "50 per application", "about 1,200 a year". */
const LEADING_NUMBER = new RegExp(`^\\s*(?:(?:about|approximately|approx\\.?|around|from|up to)\\s+)?(${NUMBER})(?![\\dA-Za-z])`, "i");

const CODES: [RegExp, string][] = [
  [/^(?:S\$|SGD|Singapore\s+dollars?)$/i, "SGD"],
  [/^(?:US\$|USD|\$|dollars?)$/i, "USD"],
  [/^(?:AED|dirhams?)$/i, "AED"],
  [/^(?:GBP|£|pounds?)$/i, "GBP"],
  [/^(?:EUR|€|euros?)$/i, "EUR"],
];

function codeOf(mark: string): string | null {
  for (const [re, code] of CODES) if (re.test(mark)) return code;
  return null;
}

/**
 * The amount of a fee, commas stripped, with its currency. When the fee names a currency, the
 * amount is the first number written beside one, so a form number, a class or a date before it is
 * never taken for money ("Form 1023 filing fee: USD 600" is 600). A fee that names no currency
 * gives a number only when it begins with one ("300"); a number further in ("course L1") is not
 * an amount.
 */
export function firstAmount(fee: string): { text: string; currency: string | null } | null {
  if (/^not stated/i.test(fee.trim())) return null;
  const beside = AMOUNT.exec(fee);
  if (beside !== null) {
    const number = beside[2] ?? beside[3]!;
    const mark = beside[1] ?? beside[4]!;
    return { text: number.replace(/,/g, ""), currency: codeOf(mark) };
  }
  if (ANY_MARK.test(fee)) return null;
  const bare = LEADING_NUMBER.exec(fee);
  return bare === null ? null : { text: bare[1]!.replace(/,/g, ""), currency: null };
}

function amountNumber(digits: string): number | null {
  const n = Number(digits.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** True when the canonical amount (commas already stripped) appears on the page as the same
 *  number, with or without trailing zeros. "3" does not match inside "300". */
export function amountOnPage(canonical: string, page: string): boolean {
  const want = amountNumber(canonical);
  if (want === null) return false;
  const re = /(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) {
    const got = amountNumber(m[0]);
    if (got !== null && got === want) return true;
  }
  return false;
}

export function checkSentence(kind: CheckKind, date: string): string {
  const shown = date === "" ? "" : shownDate(date);
  if (kind === "found") return `Read again on ${shown}: the sentence is on the page.`;
  if (kind === "found_fee_missing") return "The sentence is on the page; the fee is not. Confirm the fee.";
  if (kind === "quote_missing") return `Not confirmed: the page did not show this sentence when read on ${shown}.`;
  if (kind === "unreadable") return `The official page could not be read on ${shown}.`;
  return "No official page was given for this item.";
}

export function checkItem(item: { quote: string; fee: string; url: string | null }, page: PageRead, date: string): CheckResult {
  if (item.url === null || item.url === "") return { kind: "no_url", text: checkSentence("no_url", date) };
  if (page === null || !page.ok) return { kind: "unreadable", text: checkSentence("unreadable", date) };
  if (!quoteFound(item.quote, page.text)) return { kind: "quote_missing", text: checkSentence("quote_missing", date) };
  const amt = firstAmount(item.fee);
  if (amt !== null && !amountOnPage(amt.text, page.text)) {
    return { kind: "found_fee_missing", text: checkSentence("found_fee_missing", date) };
  }
  return { kind: "found", text: checkSentence("found", date) };
}
