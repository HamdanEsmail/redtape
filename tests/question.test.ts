import { describe, expect, it } from "vitest";
import { researchQuestion } from "../src/research/question";

describe("researchQuestion", () => {
  it("puts the activity and the three places into the fixed question and asks for official sources only", () => {
    const q = researchQuestion("open a small bakery", ["Port Aldren", "Northhaven", "Eastmere"]);
    expect(q.startsWith("What does it take to open a small bakery in each of these places: Port Aldren; Northhaven; Eastmere?")).toBe(true);
    expect(q).toContain("Use official government sources only");
    expect(q).toContain("## Categories");
    expect(q).toContain("## Place: <place name exactly as given>");
    expect(q).toContain("| Official URL | one URL of the official page this item comes from |");
    expect(q).toContain("write not stated. Never estimate");
    expect(q).toContain("## Recommendation");
    expect(q).toContain("## Unclear");
  });

  it("strips line breaks from the activity and the places before they go into the question", () => {
    const q = researchQuestion("open a\nsmall bakery", ["Port\r\nAldren", "Northhaven", "Eastmere"]);
    expect(q).toContain("open a small bakery");
    expect(q).toContain("Port Aldren");
    expect(q).not.toMatch(/open a\nsmall bakery/);
  });
});
