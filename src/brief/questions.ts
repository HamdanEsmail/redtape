// The sheet of questions for a lawyer: one question per gap, from the comparison as read.
import { isGap } from "../compare/figures";
import type { ComparisonView, ItemView } from "../compare/read";
import { NO_ITEM } from "../compare/words";
import { shownDate } from "../core/dates";

export type QuestionKind = "fee_not_stated" | "time_not_stated" | "quote_missing" | "fee_not_on_page" | "unreadable" | "no_url";

export type LawyerQuestion = {
  kind: QuestionKind;
  place: string;
  place_index: number;
  category: string;
  item: string;
  text: string;
  url: string | null;
  checked_at: string | null;
  lead: { title: string; url: string } | null;
};

export type LawyerSheet = {
  activity: string;
  places: string[];
  unclear: string[];
  questions: LawyerQuestion[];
  items: ItemView[];
};

const KINDS: readonly QuestionKind[] = ["fee_not_stated", "time_not_stated", "quote_missing", "fee_not_on_page", "unreadable", "no_url"];

function dateOf(item: ItemView): string {
  return item.checked_at === null ? "" : shownDate(item.checked_at);
}

function textFor(kind: QuestionKind, item: ItemView): string {
  const name = item.name;
  const place = item.place;
  const date = dateOf(item);
  if (kind === "fee_not_stated") return `What is the fee for ${name} in ${place}? The official page does not state it.`;
  if (kind === "time_not_stated") return `How long does ${name} take in ${place}? The official page does not state it.`;
  if (kind === "quote_missing") return `Is ${name} still required in ${place}? The page did not show the quoted sentence when read on ${date}.`;
  if (kind === "fee_not_on_page") return `Is the fee for ${name} in ${place} still ${item.fee}? The official page shows the sentence but not the amount, read on ${date}.`;
  if (kind === "unreadable") return `Is ${name} still required in ${place}? The official page could not be read on ${date}.`;
  return `Where is ${name} in ${place} set out officially? No official page was given for it.`;
}

function kindsOf(item: ItemView): QuestionKind[] {
  const has: Record<QuestionKind, boolean> = {
    fee_not_stated: isGap(item.fee),
    time_not_stated: isGap(item.time),
    quote_missing: item.check_kind === "quote_missing",
    fee_not_on_page: item.check_kind === "found_fee_missing",
    unreadable: item.check_kind === "unreadable",
    no_url: item.check_kind === "no_url",
  };
  return KINDS.filter((k) => has[k]);
}

function question(kind: QuestionKind, item: ItemView): LawyerQuestion {
  return {
    kind,
    place: item.place,
    place_index: item.place_index,
    category: item.category,
    item: item.name,
    text: textFor(kind, item),
    url: item.url,
    checked_at: item.checked_at,
    lead: kind === "fee_not_stated" ? item.fee_lead : null,
  };
}

/** Turns the comparison as `readComparison` returns it into the sheet of spec section 8. */
export function lawyerSheet(view: ComparisonView): LawyerSheet {
  const items = view.items
    .filter((i) => i.name !== NO_ITEM)
    .slice()
    .sort((a, b) => a.place_index - b.place_index || a.category_n - b.category_n || a.name.localeCompare(b.name));
  const questions: LawyerQuestion[] = [];
  for (const it of items) {
    for (const kind of kindsOf(it)) questions.push(question(kind, it));
  }
  return { activity: view.activity, places: view.places, unclear: view.unclear, questions, items };
}
