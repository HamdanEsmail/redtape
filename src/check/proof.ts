// The quote check and the amount check. Text is compared after lower-casing, removing punctuation
// and collapsing spaces. A page that could not be read is not a page that lacks the sentence.
import { shownDate } from "../core/dates";

export type PageRead = { ok: true; text: string } | { ok: false; error: string } | null;

export type CheckKind = "found" | "found_fee_missing" | "quote_missing" | "unreadable" | "no_url";

export type CheckResult = { kind: CheckKind; text: string };

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w !== "");
}

/** Longest contiguous run of words that appears in both arrays, in order. */
function longestCommonRun(quote: string[], page: string[]): number {
  let best = 0;
  let prev = new Array<number>(page.length + 1).fill(0);
  for (const word of quote) {
    const cur = new Array<number>(page.length + 1).fill(0);
    for (let j = 0; j < page.length; j++) {
      if (word === page[j]) {
        const n = prev[j]! + 1;
        cur[j + 1] = n;
        if (n > best) best = n;
      }
    }
    prev = cur;
  }
  return best;
}

/** True when a run of the quote's words, in order, is on the page: at least 8 words (or the whole
 *  quote, when shorter) and at least 60% of the quote's words. */
export function quoteFound(quote: string, page: string): boolean {
  const q = wordsOf(quote);
  const p = wordsOf(page);
  if (q.length === 0) return false;
  const minRun = q.length < 8 ? q.length : 8;
  const needShare = Math.ceil(q.length * 0.6);
  const best = longestCommonRun(q, p);
  return best >= minRun && best >= needShare;
}

const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
/** A currency written as a code or a word. */
const CURRENCY_WORD = "\\b(?:USD|SGD|AED|GBP|EUR|Singapore\\s+dollars?|dirhams?|dollars?|pounds?|euros?)\\b";
/** A currency written as a sign, a code or a word. */
const CURRENCY_MARK = `US\\$|S\\$|\\$|£|€|${CURRENCY_WORD}`;
/** A number with its currency: the mark first ("USD 600", "£50") or a code or word after ("600 dirhams"). */
const AMOUNT = new RegExp(`(${CURRENCY_MARK})[.:]?\\s*(${NUMBER})|(?<![\\d.,])(${NUMBER})\\s*\\(?(${CURRENCY_WORD})`, "i");
const ANY_MARK = new RegExp(CURRENCY_MARK, "i");
const ANY_NUMBER = new RegExp(NUMBER);

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
 * gives its first number.
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
  const bare = ANY_NUMBER.exec(fee);
  return bare === null ? null : { text: bare[0].replace(/,/g, ""), currency: null };
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
