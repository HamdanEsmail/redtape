import { describe, expect, it } from "vitest";
import { figuresForPlace } from "../src/compare/figures";
import { asGap, parseReport } from "../src/research/report";
import { ASKED, CATS, QUOTE, URLS, itemMd, reportMd } from "./helpers/report";

const asked = [...ASKED];

describe("parseReport", () => {
  it("reads a clean report: categories, items, recommendation and unclear", () => {
    const r = parseReport(reportMd({}), asked);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.categories).toEqual([...CATS]);
    expect(r.places).toHaveLength(3);
    expect(r.places.map((p) => p.askedIndex)).toEqual([0, 1, 2]);
    expect(r.places[0]!.items).toHaveLength(4);
    expect(r.places[0]!.items[1]).toMatchObject({
      categoryN: 2,
      name: "Port Aldren Activity licence",
      required: "yes",
      authority: "Aldren Licensing Office",
      fee: "USD 300",
      timeTo: "10 days",
      url: URLS.aldren,
      quote: QUOTE,
    });
    expect(r.verdict.paragraph).toMatch(/^Port Aldren is the easiest place to start/);
    expect(r.verdict.tradeoffs).toEqual([
      { place: "Port Aldren", line: "published fees, a short wait." },
      { place: "Northhaven", line: "a longer wait and more filings." },
      { place: "Eastmere", line: "mixed currencies on the same forms." },
    ]);
    expect(r.unclear).toHaveLength(2);
    expect(r.dropped).toBe(0);
  });

  it("strips bold marks, citation numbers and stray quotation marks from values", () => {
    const r = parseReport(
      reportMd({
        places: [
          {
            name: "Port Aldren",
            items: [
              itemMd(1, CATS[0], "Entity", {
                Required: "**yes** [3]",
                Fee: '"USD 300" [12]',
                Quote: `"${QUOTE}" [4]`,
                "Official URL": URLS.aldren,
              }),
              itemMd(2, CATS[1], "Licence"),
              itemMd(3, CATS[2], "Premises"),
              itemMd(4, CATS[3], "Tax"),
            ],
          },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const i = r.places[0]!.items[0]!;
    expect(i.required).toBe("yes");
    expect(i.fee).toBe("USD 300");
    expect(i.quote).toBe(QUOTE);
  });

  it("keeps an item when a field is renamed, and drops a heading it cannot read", () => {
    const r = parseReport(
      reportMd({
        places: [
          {
            name: "Port Aldren",
            items: [
              itemMd(1, CATS[0], "Entity", {
                Required: undefined,
                Authority: undefined,
                Fee: undefined,
                "Time to approval": undefined,
                Renewal: undefined,
                "Ongoing filings": undefined,
                "Official URL": undefined,
                Quote: undefined,
                "Must be required": "yes",
                Regulator: "Aldren Licensing Office",
                Cost: "USD 300",
                Wait: "10 days",
                "Renew by": "annual",
                Filing: "none",
                "Official link": URLS.aldren,
                Sentence: QUOTE,
              }),
              "### not a heading at all\n| Field | Value |\n| Official URL | https://licensing.aldren.gov.example/x |",
              itemMd(2, CATS[1], "Licence"),
              itemMd(3, CATS[2], "Premises"),
              itemMd(4, CATS[3], "Tax"),
            ],
          },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dropped).toBe(1);
    expect(r.places[0]!.items).toHaveLength(4);
    expect(r.places[0]!.items[0]).toMatchObject({
      required: "yes",
      authority: "Aldren Licensing Office",
      fee: "USD 300",
      timeTo: "10 days",
      renewal: "annual",
      ongoing: "none",
      url: URLS.aldren,
      quote: QUOTE,
    });
  });

  it("stores not stated when the fee or the time to approval is missing", () => {
    const r = parseReport(
      reportMd({
        places: [
          {
            name: "Port Aldren",
            items: [
              itemMd(1, CATS[0], "Entity", { Fee: undefined, "Time to approval": undefined }),
              itemMd(2, CATS[1], "Licence"),
              itemMd(3, CATS[2], "Premises"),
              itemMd(4, CATS[3], "Tax"),
            ],
          },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.places[0]!.items[0]!.fee).toBe("not stated");
    expect(r.places[0]!.items[0]!.timeTo).toBe("not stated");
  });

  it("keeps an extra item and a category that does not apply", () => {
    const extra = `### 2a. ${CATS[1]} :: Seasonal stall licence
| Field | Value |
|---|---|
| Required | no |
| Authority | Aldren Licensing Office |
| Fee | none |
| Time to approval | not stated |
| Renewal | none |
| Ongoing filings | none |
| Official URL | ${URLS.aldren} |
| Quote | ${QUOTE} |`;
    const r = parseReport(
      reportMd({
        places: [
          {
            name: "Port Aldren",
            items: [
              itemMd(1, CATS[0], "Entity"),
              itemMd(2, CATS[1], "Licence"),
              extra,
              itemMd(3, CATS[2], "Premises", { Required: "no" }),
              itemMd(4, CATS[3], "Tax"),
            ],
          },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.places[0]!.items).toHaveLength(5);
    expect(r.places[0]!.items.map((i) => i.categoryN)).toEqual([1, 2, 2, 3, 4]);
    expect(r.places[0]!.items[2]!.name).toBe("Seasonal stall licence");
    expect(r.places[0]!.items[3]!.required).toBe("no");
  });

  it("matches a place written differently by its first words", () => {
    const r = parseReport(
      reportMd({
        places: [
          { name: "Port Aldren, North Province (Invented Isles)", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere (coast)", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.places.map((p) => p.askedIndex)).toEqual([0, 1, 2]);
  });

  it("matches a report place that is a whole-word prefix of the place asked", () => {
    const r = parseReport(
      reportMd({
        places: [
          { name: "Port Aldren", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      ["Port Aldren harbour", "Northhaven", "Eastmere"],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.places.map((p) => p.askedIndex)).toEqual([0, 1, 2]);
    expect(r.places[0]!.name).toBe("Port Aldren harbour");
  });

  it("matches an asked place that is a whole-word prefix of the report place", () => {
    const r = parseReport(
      reportMd({
        places: [
          { name: "Port Aldren harbour", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      ["Port Aldren", "Northhaven", "Eastmere"],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.places.map((p) => p.askedIndex)).toEqual([0, 1, 2]);
  });

  it("fails when a report place could match two asked places", () => {
    const r = parseReport(
      reportMd({
        places: [
          { name: "Port", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      ["Port Aldren", "Port East", "Northhaven"],
    );
    expect(r).toEqual({ ok: false, reason: "layout" });
  });

  it("fails when two asked places start alike, rather than guessing", () => {
    const r = parseReport(reportMd({}), ["Port Aldren", "Port Aldren Bay", "Eastmere"]);
    expect(r).toEqual({ ok: false, reason: "layout" });
  });

  it("fails a report with no categories", () => {
    expect(parseReport("## Place: Port Aldren\n\n## Recommendation\nNo.\n", asked)).toEqual({ ok: false, reason: "layout" });
  });

  it("fails a report missing a place", () => {
    const r = parseReport(
      reportMd({
        places: [
          { name: "Port Aldren", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
        ],
      }),
      asked,
    );
    expect(r).toEqual({ ok: false, reason: "layout" });
  });
});

describe('"none stated" is a gap', () => {
  it("reads a fee and a wait written none stated as not stated, and counts them as gaps", () => {
    const r = parseReport(
      reportMd({
        places: [
          {
            name: "Port Aldren",
            items: [
              itemMd(1, CATS[0], "Entity", { Fee: "None Stated", "Time to approval": "none stated (see the schedule)" }),
              itemMd(2, CATS[1], "Licence", { Fee: "none" }),
              itemMd(3, CATS[2], "Premises", { Fee: "no fee" }),
              itemMd(4, CATS[3], "Tax"),
            ],
          },
          { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
          { name: "Eastmere", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.east })) },
        ],
      }),
      asked,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [entity, licence, premises] = r.places[0]!.items;
    expect(entity!.fee).toBe("not stated");
    expect(entity!.timeTo).toBe("not stated (see the schedule)");
    expect(licence!.fee).toBe("none");
    expect(premises!.fee).toBe("no fee");
    const figs = figuresForPlace(
      "Port Aldren",
      r.places[0]!.items.map((i) => ({ required: i.required, fee: i.fee, timeTo: i.timeTo, checkKind: "found" })),
    );
    expect(figs.feesNotStated).toBe(1);
    expect(figs.gaps).toBe(1);
  });

  it("rewrites only a leading none stated, as words", () => {
    expect(asGap("None stated here")).toBe("not stated here");
    expect(asGap("nonestated")).toBe("nonestated");
    expect(asGap("none")).toBe("none");
  });
});
