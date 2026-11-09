import { describe, expect, it } from "vitest";
import { figuresForPlace, isGap, waitDays } from "../src/compare/figures";

const item = (over: Record<string, string>) => ({
  required: "yes",
  fee: "USD 300",
  timeTo: "10 days",
  checkKind: "found",
  ...over,
});

describe("isGap", () => {
  it("treats only a value that starts with not stated as a gap", () => {
    expect(isGap("not stated")).toBe(true);
    expect(isGap("Not stated (see the fee schedule)")).toBe(true);
    expect(isGap("free")).toBe(false);
    expect(isGap("none")).toBe(false);
    expect(isGap("0")).toBe(false);
    expect(isGap("no fee")).toBe(false);
  });
});

describe("waitDays", () => {
  it("reads hours, days, working days, weeks, months, a range and immediate", () => {
    expect(waitDays("immediate")).toBe(0);
    expect(waitDays("within 24 hours")).toBe(1);
    expect(waitDays("10 days")).toBe(10);
    expect(waitDays("5 working days")).toBe(5);
    expect(waitDays("approximately two weeks")).toBe(14);
    expect(waitDays("1-3 months")).toBe(90);
    expect(waitDays("not stated")).toBe(null);
  });

  it("reads business days as working days and years as 365 days", () => {
    expect(waitDays("10 business days")).toBe(10);
    expect(waitDays("2 years")).toBe(730);
    expect(waitDays("1 year")).toBe(365);
  });

  it("gives no figure when the word before the unit is not a number", () => {
    expect(waitDays("within weeks")).toBe(null);
  });
});

describe("figuresForPlace", () => {
  it("adds fees that share a currency and names the longest stated wait in the page's words", () => {
    const f = figuresForPlace("Port Aldren", [
      item({ fee: "USD 300", timeTo: "10 days" }),
      item({ required: "depends (if seating)", fee: "USD 23", timeTo: "48 hours" }),
      item({ required: "no", fee: "none", timeTo: "immediate" }),
      item({ fee: "not stated", timeTo: "not stated", checkKind: "quote_missing" }),
    ]);
    expect(f.requirements).toBe(3);
    expect(f.feesStated).toBe(3);
    expect(f.feesOf).toBe(4);
    expect(f.feesSum).toBe("at least USD 323");
    expect(f.feesNotStated).toBe(1);
    expect(f.longestWait).toBe("10 days");
    expect(f.gaps).toBe(1);
  });

  it("lists mixed currencies instead of adding them", () => {
    const f = figuresForPlace("Eastmere", [item({ fee: "USD 300" }), item({ fee: "GBP 100" })]);
    expect(f.feesSum).toBe(null);
    expect(f.feesList).toEqual(["USD 300", "GBP 100"]);
  });

  it("lists amounts when some name a currency and some do not", () => {
    const f = figuresForPlace("Eastmere", [item({ fee: "USD 300" }), item({ fee: "50" })]);
    expect(f.feesSum).toBe(null);
    expect(f.feesList).toEqual(["USD 300", "50"]);
  });

  it("adds amounts that name no currency", () => {
    const f = figuresForPlace("Eastmere", [item({ fee: "300" }), item({ fee: "50" })]);
    expect(f.feesSum).toBe("at least 350");
    expect(f.feesList).toBe(null);
  });

  it("warns when the named place has more than half of its fees not stated", () => {
    const f = figuresForPlace("Eastmere", [
      item({ fee: "AED 1000" }),
      item({ fee: "not stated" }),
      item({ fee: "not stated" }),
      item({ fee: "not stated" }),
    ]);
    expect(f.costWarning).toBe("Eastmere cannot be judged on cost: 3 of 4 fees are not stated on official pages.");
  });

  it("counts a found sentence whose fee amount is missing as a gap, not as confirmed", () => {
    const f = figuresForPlace("Port Aldren", [item({ fee: "USD 300", timeTo: "10 days", checkKind: "found_fee_missing" })]);
    expect(f.gaps).toBe(1);
  });
});
