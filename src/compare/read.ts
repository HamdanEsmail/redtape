import { lawyerSheet, type LawyerQuestion } from "../brief/questions";
import { sourceLabel } from "../core/official";
import { checkSentence, type CheckKind } from "../check/proof";
import { firstWords } from "../research/report";
import { watchOf } from "../watch/watch";
import { figuresOfPlaces, type PlaceFigures } from "./figures";
import { allItems, FEE_LEAD_NONE, FEE_LEAD_SEARCHING, getComparison, placesOf, type ComparisonRow, type ItemRow } from "./store";
import { failedNotice, NO_ITEM } from "./words";

export type ItemView = {
  place: string;
  place_index: number;
  category_n: number;
  category: string;
  name: string;
  required: string;
  authority: string;
  fee: string;
  time: string;
  renewal: string;
  ongoing: string;
  url: string | null;
  quote: string;
  check_result: string;
  /** The stored check kind, or null before the item is checked. */
  check_kind: CheckKind | null;
  checked_at: string | null;
  source_label: string | null;
  fee_lead: { title: string; url: string } | null;
  /** True when a TinyFish Monitor reads this item's official page again once a day. */
  watched: boolean;
};

export type ComparisonView = {
  id: string;
  activity: string;
  places: string[];
  state: ComparisonRow["state"];
  /** When the comparison was asked for. */
  created_at: string;
  notice: string | null;
  categories: string[];
  items: ItemView[];
  figures: PlaceFigures[];
  verdict: { paragraph: string; place: string | null; heading: string | null; tradeoffs: { place: string; line: string }[]; cost_warning: string | null };
  unclear: string[];
  sources_count: number | null;
  research_minutes: number | null;
  questions: LawyerQuestion[];
  /** The watch on a saved comparison: how many official pages a Monitor reads again, and the
   *  last run reported. Null when the comparison is not watched. */
  watch: { pages: number; last_run_at: string | null } | null;
};

function categoriesOf(row: ComparisonRow): string[] {
  return row.categories_json === null ? [] : (JSON.parse(row.categories_json) as string[]);
}

function verdictOf(row: ComparisonRow): { paragraph: string; tradeoffs: { place: string; line: string }[] } {
  return row.verdict_json === null ? { paragraph: "", tradeoffs: [] } : (JSON.parse(row.verdict_json) as { paragraph: string; tradeoffs: { place: string; line: string }[] });
}

function feeLeadOf(json: string | null): { title: string; url: string } | null {
  if (json === null || json === FEE_LEAD_NONE || json === FEE_LEAD_SEARCHING) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (v !== null && typeof v === "object" && "title" in v && "url" in v) {
      const o = v as { title: unknown; url: unknown };
      if (typeof o.title === "string" && typeof o.url === "string") return { title: o.title, url: o.url };
    }
  } catch {
    // not a lead object
  }
  return null;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Where `name` stands in `text` as whole words, or -1. Both are lower-case. */
function wholeAt(text: string, name: string): number {
  for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
    const before = at === 0 ? "" : text[at - 1]!;
    const after = text[at + name.length] ?? "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return at;
  }
  return -1;
}

/** The asked place a verdict paragraph names first, by its full name or by its first words
 *  ("Manchester" for "Manchester, England"). Null when it names none. */
export function namedPlace(paragraph: string, places: string[]): string | null {
  const lower = paragraph.toLowerCase();
  let best: string | null = null;
  let bestAt = Infinity;
  for (const place of places) {
    for (const name of [place.toLowerCase(), firstWords(place)]) {
      if (name === "") continue;
      const at = wholeAt(lower, name);
      if (at !== -1 && at < bestAt) {
        best = place;
        bestAt = at;
      }
    }
  }
  return best;
}

export async function readComparison(db: D1Database, id: string): Promise<ComparisonView | null> {
  const s = await getComparison(db, id);
  if (s === null) return null;
  const places = placesOf(s);
  const categories = categoriesOf(s);
  const rows = await allItems(db, id);
  const watch = await watchOf(db, id);
  const watchedUrls = new Set(watch?.urls ?? []);
  const items: ItemView[] = [];
  for (const it of rows) {
    const date = it.checked_at ?? "";
    const kind = (it.check_kind ?? "no_url") as CheckKind;
    items.push({
      place: places[it.place_index] ?? "",
      place_index: it.place_index,
      category_n: it.category_n,
      category: categories[it.category_n - 1] ?? "",
      name: it.name,
      required: it.required,
      authority: it.authority,
      fee: it.fee,
      time: it.time_to,
      renewal: it.renewal,
      ongoing: it.ongoing,
      url: it.url,
      quote: it.quote,
      check_result: it.check_kind === null ? "" : checkSentence(kind, date),
      check_kind: it.check_kind,
      checked_at: it.checked_at,
      source_label: it.host === null ? null : sourceLabel(it.host),
      fee_lead: feeLeadOf(it.fee_lead_json),
      watched: it.url !== null && watchedUrls.has(it.url),
    });
  }
  if (s.state === "ready" || s.state === "checking") {
    for (let pi = 0; pi < places.length; pi++) {
      for (let n = 1; n <= categories.length; n++) {
        if (rows.some((it) => it.place_index === pi && it.category_n === n)) continue;
        items.push({
          place: places[pi]!,
          place_index: pi,
          category_n: n,
          category: categories[n - 1] ?? "",
          name: NO_ITEM,
          required: "",
          authority: "",
          fee: "",
          time: "",
          renewal: "",
          ongoing: "",
          url: null,
          quote: "",
          check_result: NO_ITEM,
          check_kind: null,
          checked_at: null,
          source_label: null,
          fee_lead: null,
          watched: false,
        });
      }
    }
  }
  items.sort((a, b) => a.place_index - b.place_index || a.category_n - b.category_n || a.name.localeCompare(b.name));
  const figures: PlaceFigures[] = s.figures_json !== null ? (JSON.parse(s.figures_json) as PlaceFigures[]) : figuresOfPlaces(places, rows);
  const v = verdictOf(s);
  const place = namedPlace(v.paragraph, places);
  const fig = figures.find((f) => f.place === place);
  const view: ComparisonView = {
    id: s.id,
    activity: s.activity,
    places,
    state: s.state,
    created_at: s.created_at,
    notice: s.state === "failed" ? failedNotice(s.failed_reason) : null,
    categories,
    items,
    figures,
    verdict: {
      paragraph: v.paragraph,
      place,
      heading: place === null ? null : `Shortest tape: ${place}`,
      tradeoffs: v.tradeoffs,
      cost_warning: fig?.costWarning ?? null,
    },
    unclear: s.unclear_json === null ? [] : (JSON.parse(s.unclear_json) as string[]),
    sources_count: s.sources_count,
    research_minutes: s.research_minutes,
    questions: [],
    watch: watch === null ? null : { pages: watch.pages, last_run_at: watch.last_run_at },
  };
  view.questions = lawyerSheet(view).questions;
  return view;
}

/** Ready comparisons still kept, and visitor ones still within their 7 days, newest first. */
export async function listComparisons(db: D1Database, limit = 50, now: Date = new Date()) {
  const { results } = await db
    .prepare(
      `SELECT id, activity, places_json, demo, created_at, finished_at
       FROM comparisons
       WHERE state = 'ready' AND (kept = 1 OR (kept = 0 AND expires_at IS NOT NULL AND expires_at > ?))
       ORDER BY COALESCE(finished_at, created_at) DESC LIMIT ?`,
    )
    .bind(now.toISOString(), limit)
    .all<{ id: string; activity: string; places_json: string; demo: number | null; created_at: string; finished_at: string | null }>();
  return results.map((r) => ({ id: r.id, activity: r.activity, places: JSON.parse(r.places_json) as string[], demo: r.demo, created_at: r.created_at, finished_at: r.finished_at }));
}

