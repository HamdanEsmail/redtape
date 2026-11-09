// Invented reports in the shape TinyResearch returns. Fictional places and pages only.

export const CATS = [
  "Legal entity registration",
  "Activity licence",
  "Premises approval",
  "Tax registration",
] as const;

export const ASKED = ["Port Aldren", "Northhaven", "Eastmere"] as const;

export const URLS = {
  aldren: "https://licensing.aldren.gov.example/bakery",
  north: "https://permits.northhaven.gov.example/food",
  east: "https://trade.eastmere.gov.example/shop",
} as const;

export const QUOTE = "A bakery needs a food licence from the Aldren Licensing Office.";

export function itemMd(
  n: number,
  cat: string,
  name: string,
  fields: Record<string, string | undefined> = {},
): string {
  const f: Record<string, string | undefined> = {
    Required: "yes",
    Authority: "Aldren Licensing Office",
    Fee: "USD 300",
    "Time to approval": "10 days",
    Renewal: "annual",
    "Ongoing filings": "none",
    "Official URL": URLS.aldren,
    Quote: QUOTE,
    ...fields,
  };
  const rows = Object.entries(f)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  return `### ${n}. ${cat} :: ${name}\n| Field | Value |\n|---|---|\n${rows}`;
}

export function placeMd(place: string, items: string[]): string {
  return `## Place: ${place}\n\n${items.join("\n\n")}`;
}

export function reportMd(opts: {
  categories?: string[];
  places?: { name: string; items: string[] }[];
  recommendation?: string;
  unclear?: string;
}): string {
  const categories = opts.categories ?? [...CATS];
  const catList = categories.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const defaultPlaces =
    opts.places ??
    ASKED.map((name, i) => ({
      name,
      items: categories.map((cat, n) =>
        itemMd(n + 1, cat, `${name} ${cat}`, {
          Authority: i === 0 ? "Aldren Licensing Office" : i === 1 ? "Northhaven Civic Hall" : "Eastmere Trade Desk",
          "Official URL": i === 0 ? URLS.aldren : i === 1 ? URLS.north : URLS.east,
          Quote:
            i === 0
              ? QUOTE
              : i === 1
                ? "Northhaven requires a food premises permit for every bakery."
                : "Eastmere issues a shop licence within five working days.",
        }),
      ),
    }));
  const rec =
    opts.recommendation ??
    `Port Aldren is the easiest place to start: fees are published and the wait is short.

Port Aldren: published fees, a short wait.

Northhaven: a longer wait and more filings.

Eastmere: mixed currencies on the same forms.`;
  const unclear = opts.unclear ?? `- The Aldren renewal fee is listed on a different page.\n- Eastmere does not say whether the shop licence covers seating.`;
  return `## Categories\n${catList}\n\n${defaultPlaces.map((p) => placeMd(p.name, p.items)).join("\n\n")}\n\n## Summary\n| Place | Number of required items |\n|---|---|\n| Port Aldren | 4 |\n\n## Recommendation\n${rec}\n\n## Unclear\n${unclear}\n`;
}
