import { sourceLabel } from "../core/official";
import { checkSentence, type CheckKind } from "../check/proof";
import { figuresForPlace, type PlaceFigures } from "./figures";
import { allItems, getComparison, placesOf, type ComparisonRow, type ItemRow } from "./store";
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
  checked_at: string | null;
  source_label: string | null;
};

export type ComparisonView = {
  id: string;
  activity: string;
  places: string[];
  state: ComparisonRow["state"];
  notice: string | null;
  categories: string[];
  items: ItemView[];
  figures: PlaceFigures[];
  verdict: { paragraph: string; place: string | null; heading: string | null; tradeoffs: { place: string; line: string }[]; cost_warning: string | null };
  unclear: string[];
  sources_count: number | null;
};

function categoriesOf(row: ComparisonRow): string[] {
  return row.categories_json === null ? [] : (JSON.parse(row.categories_json) as string[]);
}

function verdictOf(row: ComparisonRow): { paragraph: string; tradeoffs: { place: string; line: string }[] } {
  return row.verdict_json === null ? { paragraph: "", tradeoffs: [] } : (JSON.parse(row.verdict_json) as { paragraph: string; tradeoffs: { place: string; line: string }[] });
}

function namedPlace(paragraph: string, places: string[]): string | null {
  const lower = paragraph.toLowerCase();
  let best: string | null = null;
  for (const p of places) {
    if (lower.includes(p.toLowerCase()) && (best === null || p.length > best.length)) best = p;
  }
  return best;
}

export async function readComparison(db: D1Database, id: string): Promise<ComparisonView | null> {
  const s = await getComparison(db, id);
  if (s === null) return null;
  const places = placesOf(s);
  const categories = categoriesOf(s);
  const rows = await allItems(db, id);
  const items: ItemView[] = [];
  for (const it of rows) {
    const date = it.checked_at !== null ? it.checked_at.slice(0, 10) : "";
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
      checked_at: it.checked_at,
      source_label: it.host === null ? null : sourceLabel(it.host),
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
          checked_at: null,
          source_label: null,
        });
      }
    }
  }
  items.sort((a, b) => a.place_index - b.place_index || a.category_n - b.category_n || a.name.localeCompare(b.name));
  const figures: PlaceFigures[] =
    s.figures_json !== null
      ? (JSON.parse(s.figures_json) as PlaceFigures[])
      : places.map((place, i) =>
          figuresForPlace(
            place,
            rows.filter((it) => it.place_index === i).map((it) => ({ required: it.required, fee: it.fee, timeTo: it.time_to, checkKind: it.check_kind ?? "" })),
          ),
        );
  const v = verdictOf(s);
  const place = namedPlace(v.paragraph, places);
  const fig = figures.find((f) => f.place === place);
  return {
    id: s.id,
    activity: s.activity,
    places,
    state: s.state,
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
  };
}

export async function listComparisons(db: D1Database, limit = 50) {
  const { results } = await db
    .prepare(
      `SELECT id, activity, places_json, demo, created_at, finished_at
       FROM comparisons WHERE state = 'ready' AND kept = 1
       ORDER BY demo IS NULL, demo, created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; activity: string; places_json: string; demo: number | null; created_at: string; finished_at: string | null }>();
  return results.map((r) => ({ id: r.id, activity: r.activity, places: JSON.parse(r.places_json) as string[], demo: r.demo, created_at: r.created_at, finished_at: r.finished_at }));
}

