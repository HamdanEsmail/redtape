import { describe, expect, it } from "vitest";
import { checkItem } from "../src/check/proof";
import { researchMinutes, shownDate } from "../src/core/dates";

describe("shownDate", () => {
  it("writes a UTC day as D Mon YYYY, with no leading zero on the day", () => {
    expect(shownDate("2026-11-09")).toBe("9 Nov 2026");
    expect(shownDate("2026-11-09T10:00:00.000Z")).toBe("9 Nov 2026");
    expect(shownDate("2026-01-01T00:00:00.000Z")).toBe("1 Jan 2026");
    expect(shownDate("2026-12-31T12:00:00.000Z")).toBe("31 Dec 2026");
  });

  it("keeps the UTC day when the local clock has already moved to the next day", () => {
    expect(shownDate("2026-11-09T23:00:00.000Z")).toBe("9 Nov 2026");
  });
});

describe("researchMinutes", () => {
  it("is whole minutes between the run's created_at and completed_at, rounded", () => {
    expect(researchMinutes("2026-11-09T10:00:00.000Z", "2026-11-09T10:07:00.000Z")).toBe(7);
    expect(researchMinutes("2026-11-09T10:00:00.000Z", "2026-11-09T10:07:29.000Z")).toBe(7);
    expect(researchMinutes("2026-11-09T10:00:00.000Z", "2026-11-09T10:07:30.000Z")).toBe(8);
    expect(researchMinutes("2026-11-09T10:00:00.000Z", "2026-11-09T10:00:00.000Z")).toBe(0);
  });

  it("is null when either time is missing", () => {
    expect(researchMinutes(null, "2026-11-09T10:07:00.000Z")).toBe(null);
    expect(researchMinutes("2026-11-09T10:00:00.000Z", null)).toBe(null);
    expect(researchMinutes(null, null)).toBe(null);
  });
});

describe("a checked date in words", () => {
  const page = "A bakery needs a food licence from the Aldren Licensing Office.";

  it("puts 9 Nov 2026, not 2026-11-09, on a found check", () => {
    const r = checkItem(
      { quote: page, fee: "not stated", url: "https://licensing.aldren.gov.example/bakery" },
      { ok: true, text: page },
      "2026-11-09T10:00:00.000Z",
    );
    expect(r.text).toBe("Read again on 9 Nov 2026: the sentence is on the page.");
    expect(r.text).not.toContain("2026-11-09");
  });
});
