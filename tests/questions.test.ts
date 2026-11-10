import { describe, expect, it } from "vitest";
import { lawyerSheet } from "../src/brief/questions";
import type { CheckKind } from "../src/check/proof";
import type { ComparisonView, ItemView } from "../src/compare/read";
import { NO_ITEM } from "../src/compare/words";

const CHECKED = "2026-11-09T10:00:00.000Z";
const SHOWN = "9 Nov 2026";
const FOUND = `Read again on ${SHOWN}: the sentence is on the page.`;
const QUOTE_MISSING = `Not confirmed: the page did not show this sentence when read on ${SHOWN}.`;
const FEE_NOT_ON_PAGE = "The sentence is on the page; the fee is not. Confirm the fee.";
const UNREADABLE = `The official page could not be read on ${SHOWN}.`;
const NO_URL = "No official page was given for this item.";

function checkKindOf(result: string): CheckKind | null {
  if (result.startsWith("Read again on")) return "found";
  if (result.startsWith("Not confirmed:")) return "quote_missing";
  if (result.startsWith("The sentence is on the page; the fee is not.")) return "found_fee_missing";
  if (result.startsWith("The official page could not be read")) return "unreadable";
  if (result === NO_URL) return "no_url";
  return null;
}

function item(over: Partial<ItemView> & Pick<ItemView, "name" | "place" | "place_index" | "category">): ItemView {
  const merged: ItemView = {
    category_n: 1,
    required: "yes",
    authority: "Aldren Licensing Office",
    fee: "USD 300",
    time: "10 days",
    renewal: "annual",
    ongoing: "none",
    url: "https://licensing.aldren.gov.example/bakery",
    quote: "A bakery needs a food licence from the Aldren Licensing Office.",
    check_result: FOUND,
    check_kind: "found",
    checked_at: CHECKED,
    source_label: "government domain",
    fee_lead: null,
    watched: false,
    ...over,
  };
  if (over.check_kind === undefined) merged.check_kind = checkKindOf(merged.check_result);
  return merged;
}

function view(items: ItemView[], over: Partial<ComparisonView> = {}): ComparisonView {
  return {
    id: "abcdefghijkl",
    created_at: "2026-11-09T10:00:00.000Z",
    activity: "open a small bakery",
    places: ["Port Aldren", "Northhaven", "Eastmere"],
    state: "ready",
    notice: null,
    categories: ["Legal entity registration", "Activity licence"],
    items,
    figures: [],
    verdict: { paragraph: "", place: null, heading: null, tradeoffs: [], cost_warning: null },
    unclear: [],
    sources_count: 3,
    research_minutes: 7,
    questions: [],
    watch: null,
    ...over,
  };
}

describe("lawyerSheet", () => {
  it("writes the fee_not_stated question in the exact words", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          category_n: 2,
          fee: "not stated",
        }),
      ]),
    );
    expect(sheet.questions).toEqual([
      {
        kind: "fee_not_stated",
        place: "Port Aldren",
        place_index: 0,
        category: "Activity licence",
        item: "Aldren bakery licence",
        text: "What is the fee for Aldren bakery licence in Port Aldren? The official page does not state it.",
        url: "https://licensing.aldren.gov.example/bakery",
        checked_at: CHECKED,
        lead: null,
      },
    ]);
  });

  it("writes the time_not_stated question in the exact words", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          time: "not stated (see the service standard)",
        }),
      ]),
    );
    expect(sheet.questions[0]).toMatchObject({
      kind: "time_not_stated",
      text: "How long does Aldren bakery licence take in Port Aldren? The official page does not state it.",
    });
  });

  it("writes the quote_missing question with the checked day in words", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          check_result: QUOTE_MISSING,
        }),
      ]),
    );
    expect(sheet.questions[0]).toMatchObject({
      kind: "quote_missing",
      text: `Is Aldren bakery licence still required in Port Aldren? The page did not show the quoted sentence when read on ${SHOWN}.`,
    });
  });

  it("writes the fee_not_on_page question with the fee as written and the checked day", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          fee: "USD 999",
          check_result: FEE_NOT_ON_PAGE,
        }),
      ]),
    );
    expect(sheet.questions[0]).toMatchObject({
      kind: "fee_not_on_page",
      text: `Is the fee for Aldren bakery licence in Port Aldren still USD 999? The official page shows the sentence but not the amount, read on ${SHOWN}.`,
    });
  });

  it("writes the unreadable question with the checked day in words", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          check_result: UNREADABLE,
        }),
      ]),
    );
    expect(sheet.questions[0]).toMatchObject({
      kind: "unreadable",
      text: `Is Aldren bakery licence still required in Port Aldren? The official page could not be read on ${SHOWN}.`,
    });
  });

  it("writes the no_url question in the exact words", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          url: null,
          check_result: NO_URL,
        }),
      ]),
    );
    expect(sheet.questions[0]).toMatchObject({
      kind: "no_url",
      url: null,
      text: "Where is Aldren bakery licence in Port Aldren set out officially? No official page was given for it.",
    });
  });

  it("writes two questions for an item with two gaps, in kind order", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          fee: "not stated",
          check_result: QUOTE_MISSING,
        }),
      ]),
    );
    expect(sheet.questions.map((q) => q.kind)).toEqual(["fee_not_stated", "quote_missing"]);
  });

  it("writes no question for an item with no gap", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
        }),
      ]),
    );
    expect(sheet.questions).toEqual([]);
  });

  it("drops a No item returned placeholder from items and writes no question for it", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: NO_ITEM,
          place: "Eastmere",
          place_index: 2,
          category: "Activity licence",
          category_n: 2,
          fee: "not stated",
          time: "not stated",
          url: null,
          check_result: NO_ITEM,
          checked_at: null,
        }),
      ]),
    );
    expect(sheet.items).toEqual([]);
    expect(sheet.questions).toEqual([]);
  });

  it("keeps the report's unclear rules in order", () => {
    const unclear = ["The Aldren renewal fee is listed on a different page.", "Eastmere does not say whether the shop licence covers seating."];
    const sheet = lawyerSheet(view([], { unclear }));
    expect(sheet.unclear).toEqual(unclear);
    expect(sheet.activity).toBe("open a small bakery");
    expect(sheet.places).toEqual(["Port Aldren", "Northhaven", "Eastmere"]);
  });

  it("orders questions by place, then category, then kind", () => {
    const sheet = lawyerSheet(
      view([
        item({
          name: "Northhaven food permit",
          place: "Northhaven",
          place_index: 1,
          category: "Activity licence",
          category_n: 2,
          fee: "not stated",
          time: "not stated",
        }),
        item({
          name: "Aldren company filing",
          place: "Port Aldren",
          place_index: 0,
          category: "Legal entity registration",
          category_n: 1,
          check_result: UNREADABLE,
        }),
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          category_n: 2,
          fee: "not stated",
        }),
      ]),
    );
    expect(sheet.questions.map((q) => `${q.place_index}:${q.category}:${q.kind}`)).toEqual([
      "0:Legal entity registration:unreadable",
      "0:Activity licence:fee_not_stated",
      "1:Activity licence:fee_not_stated",
      "1:Activity licence:time_not_stated",
    ]);
  });

  it("lists real items by place, then category, and omits placeholders", () => {
    const realA = item({
      name: "Aldren company filing",
      place: "Port Aldren",
      place_index: 0,
      category: "Legal entity registration",
      category_n: 1,
    });
    const realB = item({
      name: "Northhaven food permit",
      place: "Northhaven",
      place_index: 1,
      category: "Activity licence",
      category_n: 2,
    });
    const placeholder = item({
      name: NO_ITEM,
      place: "Eastmere",
      place_index: 2,
      category: "Legal entity registration",
      category_n: 1,
      check_result: NO_ITEM,
    });
    const sheet = lawyerSheet(view([realA, placeholder, realB]));
    expect(sheet.items.map((i) => i.name)).toEqual(["Aldren company filing", "Northhaven food permit"]);
  });

  it("puts a fee lead only on fee_not_stated, and only when one was found", () => {
    const lead = { title: "Aldren fee schedule", url: "https://licensing.aldren.gov.example/fees" };
    const sheet = lawyerSheet(
      view([
        item({
          name: "Aldren bakery licence",
          place: "Port Aldren",
          place_index: 0,
          category: "Activity licence",
          fee: "not stated",
          time: "not stated",
          fee_lead: lead,
        }),
      ]),
    );
    expect(sheet.questions).toHaveLength(2);
    expect(sheet.questions[0]).toMatchObject({ kind: "fee_not_stated", lead });
    expect(sheet.questions[1]).toMatchObject({ kind: "time_not_stated", lead: null });
  });
});
