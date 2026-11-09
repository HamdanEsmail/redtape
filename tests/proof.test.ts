import { describe, expect, it } from "vitest";
import { amountOnPage, checkItem, firstAmount, quoteFound } from "../src/check/proof";

const PAGE = `The Aldren Licensing Office publishes bakery rules.

A bakery needs a food licence from the Aldren Licensing Office.

The fee is USD 300. Renewal is annual. A late filing of 1,000 units is a different figure.`;

describe("quoteFound", () => {
  it("finds a long quote when an 8-word run covering 60% of it is on the page", () => {
    expect(quoteFound("A bakery needs a food licence from the Aldren Licensing Office.", PAGE)).toBe(true);
  });

  it("rejects a quote that only shares a few common words", () => {
    expect(quoteFound("The office is open on weekdays from nine until five each day.", PAGE)).toBe(false);
  });

  it("passes a three-word quote only when the whole quote is on the page", () => {
    expect(quoteFound("Renewal is annual", PAGE)).toBe(true);
    expect(quoteFound("Renewal is monthly", PAGE)).toBe(false);
  });

  it("finds a quote on a 30,000-word page", () => {
    const quote = "A bakery needs a food licence from the Aldren Licensing Office.";
    const words = Array.from({ length: 30_000 }, (_, i) => `w${i}`);
    words.splice(15_000, 0, ...quote.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim().split(/\s+/));
    expect(quoteFound(quote, words.join(" "))).toBe(true);
  });
});

describe("firstAmount and amountOnPage", () => {
  it("reads 300 from $300, USD 300 and 300 dollars", () => {
    expect(firstAmount("$300")).toEqual({ text: "300", currency: "USD" });
    expect(firstAmount("USD 300")).toEqual({ text: "300", currency: "USD" });
    expect(firstAmount("300 dollars")).toEqual({ text: "300", currency: "USD" });
  });

  it("treats 1,000 and 1000 as the same amount", () => {
    expect(firstAmount("GBP 1,000")).toEqual({ text: "1000", currency: "GBP" });
    expect(amountOnPage("1000", "The fee is 1,000 pounds.")).toBe(true);
    expect(amountOnPage("1000", "The fee is 1000 pounds.")).toBe(true);
  });

  it("finds 12.34 and does not match 3 inside 300", () => {
    expect(firstAmount("£12.34 per year")).toEqual({ text: "12.34", currency: "GBP" });
    expect(amountOnPage("12.34", "The fee is £12.34 per year.")).toBe(true);
    expect(amountOnPage("3", PAGE)).toBe(false);
    expect(amountOnPage("300", PAGE)).toBe(true);
  });

  it("compares amounts as numbers, so 300 matches 300.00", () => {
    expect(amountOnPage("300", "The fee is $300.00.")).toBe(true);
    expect(amountOnPage("1000", "The fee is 1000.00.")).toBe(true);
    expect(amountOnPage("12.5", "The fee is 12.50.")).toBe(true);
  });

  it("does not match 300 inside 1,300 or 3000", () => {
    expect(amountOnPage("300", "Pay 1,300 now.")).toBe(false);
    expect(amountOnPage("300", "Pay 3000 now.")).toBe(false);
  });

  it("reads dirhams as AED and Singapore dollars as SGD", () => {
    expect(firstAmount("300 dirhams")).toEqual({ text: "300", currency: "AED" });
    expect(firstAmount("50 dirham")).toEqual({ text: "50", currency: "AED" });
    expect(firstAmount("100 Singapore dollars")).toEqual({ text: "100", currency: "SGD" });
    expect(firstAmount("100 Singapore dollar")).toEqual({ text: "100", currency: "SGD" });
  });
});

describe("checkItem", () => {
  const date = "2026-11-09";

  it("says the sentence is on the page when the quote is found and no fee is stated", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "not stated", url: "https://licensing.aldren.gov.example/bakery" }, { ok: true, text: PAGE }, date)).toEqual({
      kind: "found",
      text: "Read again on 2026-11-09: the sentence is on the page.",
    });
  });

  it("says the sentence is on the page when the fee's amount is there too", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: "https://x.example" }, { ok: true, text: PAGE }, date).kind).toBe("found");
  });

  it("finds a fee of USD 300 on a page that shows $300.00", () => {
    const page = "A bakery needs a food licence from the Aldren Licensing Office.\n\nThe published fee is $300.00.";
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: "https://x.example" }, { ok: true, text: page }, date).kind).toBe("found");
  });

  it("asks to confirm the fee when the sentence is on the page and the amount is not", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 999", url: "https://x.example" }, { ok: true, text: PAGE }, date)).toEqual({
      kind: "found_fee_missing",
      text: "The sentence is on the page; the fee is not. Confirm the fee.",
    });
  });

  it("is not confirmed when the page did not show the sentence", () => {
    expect(checkItem({ quote: "Widgets must be painted blue before they are sold in Port Aldren.", fee: "USD 300", url: "https://x.example" }, { ok: true, text: PAGE }, date)).toEqual({
      kind: "quote_missing",
      text: "Not confirmed: the page did not show this sentence when read on 2026-11-09.",
    });
  });

  it("says the official page could not be read, never that the sentence was missing", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: "https://x.example" }, { ok: false, error: "bot_blocked" }, date)).toEqual({
      kind: "unreadable",
      text: "The official page could not be read on 2026-11-09.",
    });
  });

  it("says no official page was given when there is no URL", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: null }, null, date)).toEqual({
      kind: "no_url",
      text: "No official page was given for this item.",
    });
  });
});
