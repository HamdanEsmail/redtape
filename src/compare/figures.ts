// Per-place figures: requirements, fees stated, the sum per currency (never converted, never added
// across currencies), the longest stated wait, gaps, and the cost sentence.
import { firstAmount } from "../check/proof";

export type FigureItem = { required: string; fee: string; timeTo: string; checkKind: string };

export type PlaceFigures = {
  place: string;
  requirements: number;
  feesStated: number;
  feesOf: number;
  feesSum: string | null;
  feesList: string[] | null;
  feesNotStated: number;
  longestWait: string | null;
  gaps: number;
  costWarning: string | null;
};

/** A value that starts with "not stated" (any case) is a gap. Nothing else is. */
export function isGap(value: string): boolean {
  return /^not stated/i.test(value.trim());
}

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function parseNum(s: string): number | null {
  const w = WORDS[s.toLowerCase()];
  if (w !== undefined) return w;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function unitDays(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("hour")) return Math.ceil(n / 24);
  if (u.startsWith("working") || u.startsWith("business") || u.startsWith("day")) return n;
  if (u.startsWith("week")) return n * 7;
  if (u.startsWith("month")) return n * 30;
  if (u.startsWith("year")) return n * 365;
  return n;
}

/** A stated wait as days, or null when it cannot be read. A range takes its upper end. */
export function waitDays(text: string): number | null {
  if (isGap(text)) return null;
  if (/\bimmediate\b/i.test(text)) return 0;
  const unit = "(working\\s+days?|business\\s+days?|hours?|days?|weeks?|months?|years?)";
  const num = "(\\d+(?:\\.\\d+)?|[A-Za-z]+)";
  const range = text.match(new RegExp(`${num}\\s*(?:-|–|to)\\s*${num}\\s*${unit}`, "i"));
  if (range) {
    const n = parseNum(range[2]!);
    return n === null ? null : unitDays(n, range[3]!);
  }
  const one = text.match(new RegExp(`${num}\\s*${unit}`, "i"));
  if (one) {
    const n = parseNum(one[1]!);
    return n === null ? null : unitDays(n, one[2]!);
  }
  return null;
}

/** Confirmed only when the sentence is on the page and the fee's amount is too, when a fee is stated. */
function confirmed(kind: string): boolean {
  return kind === "found";
}

export function figuresForPlace(place: string, items: FigureItem[]): PlaceFigures {
  const requirements = items.filter((i) => /^(yes|depends)\b/i.test(i.required.trim())).length;
  const feesStatedItems = items.filter((i) => !isGap(i.fee));
  const feesNotStated = items.length - feesStatedItems.length;
  const amounts = feesStatedItems.map((i) => ({ raw: i.fee, amt: firstAmount(i.fee) })).filter((x) => x.amt !== null);
  const currencies = amounts.map((a) => a.amt!.currency);
  const sameCurrency = amounts.length > 0 && currencies.every((c) => c === currencies[0]);
  let feesSum: string | null = null;
  let feesList: string[] | null = null;
  if (amounts.length > 0) {
    if (sameCurrency) {
      const cur = currencies[0];
      const sum = amounts.reduce((s, a) => s + Number(a.amt!.text), 0);
      const shown = (Math.round(sum * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
      feesSum = cur ? `at least ${cur} ${shown}` : `at least ${shown}`;
    } else {
      feesList = amounts.map((a) => a.raw);
    }
  }
  let longestWait: string | null = null;
  let longestDays = -1;
  for (const i of items) {
    const d = waitDays(i.timeTo);
    if (d === null) continue;
    if (d > longestDays) {
      longestDays = d;
      longestWait = i.timeTo;
    }
  }
  const gaps = items.filter((i) => isGap(i.fee) || isGap(i.timeTo) || !confirmed(i.checkKind)).length;
  const costWarning =
    items.length > 0 && feesNotStated > items.length / 2
      ? `${place} cannot be judged on cost: ${feesNotStated} of ${items.length} fees are not stated on official pages.`
      : null;
  return {
    place,
    requirements,
    feesStated: feesStatedItems.length,
    feesOf: items.length,
    feesSum,
    feesList,
    feesNotStated,
    longestWait,
    gaps,
    costWarning,
  };
}
