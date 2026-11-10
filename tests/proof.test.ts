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

  it("needs the run to be unbroken: the same words with others between them do not count", () => {
    const quote = "Every bakery must hold a food licence before it opens to the public.";
    expect(quoteFound(quote, "Every bakery must hold a food, in most cases, licence before it opens to the public.")).toBe(false);
    expect(quoteFound(quote, "Note. Every bakery must hold a food licence before it opens to the public. End.")).toBe(true);
  });

  it("finds the full sentence after a false start that repeats its first words", () => {
    const quote = "The fee for the licence is the fee set by the council each year.";
    const page = "The fee for the permit differs. The fee for the licence is the fee set by the council each year.";
    expect(quoteFound(quote, page)).toBe(true);
  });

  it("asks for 60% of a long quote: 12 of 20 words in a row pass, 11 do not", () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const quote = words.join(" ");
    expect(quoteFound(quote, `start ${words.slice(0, 12).join(" ")} other ${words.slice(12).join(" other ")}`)).toBe(true);
    expect(quoteFound(quote, `start ${words.slice(0, 11).join(" ")} other ${words.slice(11).join(" other ")}`)).toBe(false);
  });

  it("splits words the same way in the quote and on the page", () => {
    expect(quoteFound("You don't need a licence for under-18s' events", "Good news: you don’t need a licence for under-18s’ events.")).toBe(true);
    expect(quoteFound("Fee: £12.34 per year", "The fee: £12.34 per year, payable online.")).toBe(true);
  });

  it("agrees with the plain word-by-word comparison on 400 made-up pages", () => {
    // The reference: every quote word against every page word, the slow and obvious way.
    const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const reference = (quote: string, page: string): boolean => {
      const q = words(quote);
      const p = words(page);
      if (q.length === 0) return false;
      let best = 0;
      let prev = new Array<number>(p.length + 1).fill(0);
      for (const word of q) {
        const cur = new Array<number>(p.length + 1).fill(0);
        for (let j = 0; j < p.length; j++) {
          if (word === p[j]) {
            cur[j + 1] = prev[j]! + 1;
            if (cur[j + 1]! > best) best = cur[j + 1]!;
          }
        }
        prev = cur;
      }
      return best >= (q.length < 8 ? q.length : 8) && best >= Math.ceil(q.length * 0.6);
    };
    let seed = 20261110;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const VOCAB = ["a", "the", "fee", "licence", "permit", "of", "for", "bakery", "council", "office", "must", "hold", "registration", "is", "to"];
    const OTHER = Array.from({ length: 200 }, (_, i) => `other${i}`);
    const from = (vocab: string[], n: number) => Array.from({ length: n }, () => vocab[rand(vocab.length)]!).join(" ");
    const sentence = (n: number) => from(VOCAB, n);
    const SEPARATORS = [" ", ", ", ".\n\n", " | ", " **", "; ", " – ", "  \n"];
    let found = 0;
    for (let n = 0; n < 400; n++) {
      const quoteWords = sentence(1 + rand(24)).split(" ");
      const keepFrom = rand(quoteWords.length);
      const keep = quoteWords.slice(keepFrom, keepFrom + 1 + rand(quoteWords.length - keepFrom));
      const onPage = keep.map((w) => w + SEPARATORS[rand(SEPARATORS.length)]).join("");
      // Half the pages are made of the quote's own words, half of words the quote never uses.
      const around = (k: number) => (n % 2 === 0 ? sentence(k) : from(OTHER, k));
      const page = `${around(rand(900))}. ${rand(4) === 0 ? "" : onPage} ${around(rand(900))}`;
      const quote = quoteWords.join(" ");
      const want = reference(quote, page);
      if (want) found++;
      expect(quoteFound(quote, page), `case ${n}: "${quote}"`).toBe(want);
    }
    expect(found).toBeGreaterThan(40);
    expect(found).toBeLessThan(360);
  });

  it("finds a sentence at the very start and at the very end of a page", () => {
    const quote = "A bakery needs a food licence from the Aldren Licensing Office.";
    const filler = Array.from({ length: 4000 }, (_, i) => `w${i}`).join(" ");
    expect(quoteFound(quote, `${quote} ${filler}`)).toBe(true);
    expect(quoteFound(quote, `${filler} ${quote}`)).toBe(true);
    expect(quoteFound(quote, `${filler} ${quote.slice(0, 30)}`)).toBe(false);
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

  it("takes the number beside the currency, not a form number, a class or a date", () => {
    expect(firstAmount("Form 1023 filing fee: USD 600")).toEqual({ text: "600", currency: "USD" });
    expect(firstAmount("Class 3 licence: SGD 150")).toEqual({ text: "150", currency: "SGD" });
    expect(firstAmount("From 1 January 2026: AED 500")).toEqual({ text: "500", currency: "AED" });
    expect(firstAmount("Schedule 2 fee: GBP 40")).toEqual({ text: "40", currency: "GBP" });
    expect(firstAmount("2 inspections at £75 each")).toEqual({ text: "75", currency: "GBP" });
    expect(firstAmount("Tier 2: 1,500 dirhams a year")).toEqual({ text: "1500", currency: "AED" });
  });

  it("gives the amount the currency written beside it", () => {
    expect(firstAmount("US$50")).toEqual({ text: "50", currency: "USD" });
    expect(firstAmount("S$150 (about USD 110)")).toEqual({ text: "150", currency: "SGD" });
    expect(firstAmount("GBP 40, or 50 euros by post")).toEqual({ text: "40", currency: "GBP" });
  });

  it("falls back to a bare number only when the fee names no currency", () => {
    expect(firstAmount("300")).toEqual({ text: "300", currency: null });
    expect(firstAmount("Section 12 sets the fee in dirhams")).toBeNull();
    expect(firstAmount("free")).toBeNull();
  });

  it("takes a bare number only when the fee begins with it", () => {
    expect(firstAmount("50 per application")).toEqual({ text: "50", currency: null });
    expect(firstAmount("about 1,200 a year")).toEqual({ text: "1200", currency: null });
    expect(firstAmount("Flyer ID: free (online test); GVC/RPC-L1: not stated")).toBeNull();
    expect(firstAmount("free for the first 2 years")).toBeNull();
  });
});

describe("checkItem", () => {
  const date = "2026-11-09";

  it("says the sentence is on the page when the quote is found and no fee is stated", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "not stated", url: "https://licensing.aldren.gov.example/bakery" }, { ok: true, text: PAGE }, date)).toEqual({
      kind: "found",
      text: "Read again on 9 Nov 2026: the sentence is on the page.",
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

  it("does not take a form number on the page for the fee", () => {
    const quote = "Organisations file Form 1023 to apply for recognition of exemption under section 501.";
    const page = `${quote} The user fee is $275.`;
    expect(checkItem({ quote, fee: "Form 1023 filing fee: USD 600", url: "https://x.example" }, { ok: true, text: page }, date).kind).toBe(
      "found_fee_missing",
    );
  });

  it("is not confirmed when the page did not show the sentence", () => {
    expect(checkItem({ quote: "Widgets must be painted blue before they are sold in Port Aldren.", fee: "USD 300", url: "https://x.example" }, { ok: true, text: PAGE }, date)).toEqual({
      kind: "quote_missing",
      text: "Not confirmed: the page did not show this sentence when read on 9 Nov 2026.",
    });
  });

  it("says the official page could not be read, never that the sentence was missing", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: "https://x.example" }, { ok: false, error: "bot_blocked" }, date)).toEqual({
      kind: "unreadable",
      text: "The official page could not be read on 9 Nov 2026.",
    });
  });

  it("says no official page was given when there is no URL", () => {
    expect(checkItem({ quote: "A bakery needs a food licence from the Aldren Licensing Office.", fee: "USD 300", url: null }, null, date)).toEqual({
      kind: "no_url",
      text: "No official page was given for this item.",
    });
  });
});
