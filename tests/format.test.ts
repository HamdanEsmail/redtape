// How stored words are shown, and which place a verdict names. Invented places, except where a
// real report's wording is the point.
import { describe, expect, it } from "vitest";
import { namedPlace } from "../src/compare/read";
import { placeAskLine, unclearParts } from "../src/site/format";

describe("the place a verdict names", () => {
  it("is found by the place's first words, not only by its full name", () => {
    expect(namedPlace("Port Aldren is the easiest place to start.", ["Northhaven, East", "Port Aldren, Westland", "Eastmere mainland"])).toBe(
      "Port Aldren, Westland",
    );
  });

  it("is the first place the paragraph names when it names several", () => {
    const paragraph = "Northhaven is the easiest place to start. It has no residency rule, unlike Eastmere, and fewer filings than Port Aldren.";
    expect(namedPlace(paragraph, ["Port Aldren", "Northhaven", "Eastmere"])).toBe("Northhaven");
  });

  it("is none when the paragraph names no place that was asked for", () => {
    expect(namedPlace("All three are about the same.", ["Port Aldren", "Northhaven", "Eastmere"])).toBe(null);
    expect(namedPlace("", ["Port Aldren", "Northhaven", "Eastmere"])).toBe(null);
  });

  it("does not find a place inside a longer word", () => {
    expect(namedPlace("Eastmerely a formality.", ["Port Aldren", "Northhaven", "Eastmere"])).toBe(null);
  });
});

describe("one place on a ready first screen", () => {
  const fig = {
    place: "Port Aldren, Westland",
    requirements: 7,
    feesStated: 3,
    feesOf: 7,
    feesSum: "at least USD 609",
    feesList: null,
    feesNotStated: 4,
    longestWait: "approximately two weeks for a change of use review as of 1 October 2025 (reduced from two months)",
    gaps: 7,
    costWarning: null,
  };

  it("ends a wait that was cut short with its ellipsis, not with an ellipsis and a full stop", () => {
    const line = placeAskLine(fig);
    expect(line.endsWith("….")).toBe(false);
    expect(line.endsWith("…")).toBe(true);
  });

  it("ends a wait that fits with a full stop", () => {
    expect(placeAskLine({ ...fig, longestWait: "10 days" })).toBe("Port Aldren: 3 of 7 fees stated, at least USD 609, longest stated wait: 10 days.");
  });
});

describe("an unclear rule on the home", () => {
  it("drops the address it ends with, and the bracket around it", () => {
    const line = "Port Aldren, Westland – The premises page does not state a fee for a change of use. [https://licensing.aldren.gov.example/premises]";
    expect(unclearParts(line)).toEqual({ head: "Port Aldren, Westland", rest: "The premises page does not state a fee for a change of use." });
  });

  it("drops several addresses and an address in round brackets", () => {
    const line =
      "Eastmere – The licence fee is not stated. [https://trade.eastmere.gov.example/a] [https://trade.eastmere.gov.example/b] (https://trade.eastmere.gov.example/c)";
    expect(unclearParts(line).rest).toBe("The licence fee is not stated.");
  });
});
