// The quote check and the amount check. Text is compared after lower-casing, removing punctuation
// and collapsing spaces. A page that could not be read is not a page that lacks the sentence.

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

const CURRENCY: [RegExp, string][] = [
  [/S\$|SGD|Singapore dollars?/i, "SGD"],
  [/dirhams?/i, "AED"],
  [/USD|US\$|dollars?/i, "USD"],
  [/GBP|£|pounds?/i, "GBP"],
  [/AED/i, "AED"],
  [/EUR|€|euros?/i, "EUR"],
  [/\$/, "USD"],
];

const NUM = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/;

/** The first amount in a fee string, commas stripped, and a currency when the string names one. */
export function firstAmount(fee: string): { text: string; currency: string | null } | null {
  if (/^not stated/i.test(fee.trim())) return null;
  const m = fee.match(NUM);
  if (!m) return null;
  const text = m[0].replace(/,/g, "");
  let currency: string | null = null;
  for (const [re, code] of CURRENCY) {
    if (re.test(fee)) {
      currency = code;
      break;
    }
  }
  return { text, currency };
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
  if (kind === "found") return `Read again on ${date}: the sentence is on the page.`;
  if (kind === "found_fee_missing") return "The sentence is on the page; the fee is not. Confirm the fee.";
  if (kind === "quote_missing") return `Not confirmed: the page did not show this sentence when read on ${date}.`;
  if (kind === "unreadable") return `The official page could not be read on ${date}.`;
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
