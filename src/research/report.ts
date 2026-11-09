// The report is untrusted prose from a model. Every field can be missing, renamed, wrapped in
// bold, followed by a citation number, or put in the wrong place. The reader keeps what it can
// read and counts what it drops; only a report with no categories or a missing place fails.
import { CATEGORIES_MAX, CATEGORIES_MIN } from "../core/limits";

export type ParsedItem = {
  categoryN: number;
  name: string;
  required: string;
  authority: string;
  fee: string;
  timeTo: string;
  renewal: string;
  ongoing: string;
  url: string | null;
  quote: string;
};

export type ParsedPlace = { askedIndex: number; name: string; items: ParsedItem[] };

export type ParseOk = {
  ok: true;
  categories: string[];
  places: ParsedPlace[];
  dropped: number;
  verdict: { paragraph: string; tradeoffs: { place: string; line: string }[] };
  unclear: string[];
};

export type ParseFail = { ok: false; reason: "layout" };

export function cleanValue(s: string): string {
  return String(s ?? "")
    .replace(/\*\*/g, "")
    .replace(/\s*\[[\d,\s]+\]/g, "")
    .replace(/^["\u201C\u201D']+|["\u201C\u201D']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The name up to the first comma or opening parenthesis, lower-cased. */
export function firstWords(name: string): string {
  return cleanValue(name)
    .replace(/\s*[,(].*$/, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when one name equals the other or is a whole-word prefix of it. */
export function alike(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

function section(report: string, name: string): string {
  const parts = report.split(new RegExp(`^## ${name}\\s*$`, "m"));
  if (parts.length < 2) return "";
  return parts[1]!.split(/^## /m)[0] ?? "";
}

function officialUrl(value: string): string | null {
  const m = value.match(/https?:\/\/[^\s|]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;]+$/, "");
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/** Which item field a table key names, by the words in the key, not its exact text. */
function fieldSlot(key: string): "required" | "authority" | "fee" | "timeTo" | "renewal" | "ongoing" | "url" | "quote" | null {
  const k = key.toLowerCase();
  if (k.includes("fee") || k.includes("cost")) return "fee";
  if ((k.includes("time") || k.includes("wait") || k.includes("approval")) && !k.includes("renewal")) return "timeTo";
  if (k.includes("url") || k.includes("link")) return "url";
  if (k.includes("quote") || k.includes("sentence")) return "quote";
  if (k.includes("renew")) return "renewal";
  if (k.includes("ongoing") || k.includes("filing")) return "ongoing";
  if (k.includes("authority") || k.includes("regulator") || k.includes("issued by")) return "authority";
  if (k.includes("required")) return "required";
  return null;
}

function fieldsOf(block: string): Record<string, string> {
  const f: Record<string, string> = {};
  for (const l of block.split("\n")) {
    const row = l.match(/^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!row) continue;
    const key = cleanValue(row[1]!);
    if (key === "Field" || /^-+$/.test(key)) continue;
    const slot = fieldSlot(key);
    if (slot === null || f[slot] !== undefined) continue;
    f[slot] = cleanValue(row[2]!);
  }
  return f;
}

function parseItems(body: string): { items: ParsedItem[]; dropped: number } {
  const items: ParsedItem[] = [];
  let dropped = 0;
  for (const b of body.split(/^### /m).slice(1)) {
    const head = b.split("\n")[0] ?? "";
    const m = head.match(/^(\d+)[a-z]?\.\s*(.+?)\s*::\s*(.+)$/i);
    if (!m) {
      dropped++;
      continue;
    }
    const f = fieldsOf(b);
    items.push({
      categoryN: Number(m[1]),
      name: cleanValue(m[3]!),
      required: f.required ?? "",
      authority: f.authority ?? "",
      fee: f.fee || "not stated",
      timeTo: f.timeTo || "not stated",
      renewal: f.renewal ?? "",
      ongoing: f.ongoing ?? "",
      url: officialUrl(f.url ?? ""),
      quote: cleanValue(f.quote ?? ""),
    });
  }
  return { items, dropped };
}

function matchAsked(reportName: string, asked: { i: number; key: string }[]): number | "ambiguous" | null {
  const key = firstWords(reportName);
  const hits = asked.filter((a) => alike(a.key, key));
  if (hits.length === 1) return hits[0]!.i;
  if (hits.length > 1) return "ambiguous";
  return null;
}

function tradeoffLine(para: string, place: string): string {
  const lower = para.toLowerCase();
  const names = [place, firstWords(place)].sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (n !== "" && lower.startsWith(n.toLowerCase())) {
      return cleanValue(para.slice(n.length).replace(/^\s*(\([^)]*\))?\s*:?\s*/, ""));
    }
  }
  return para;
}

function startsWithPlace(para: string, places: string[]): string | null {
  const lower = para.toLowerCase();
  let best: string | null = null;
  for (const p of places) {
    const keys = [p, firstWords(p)];
    for (const k of keys) {
      if (k !== "" && lower.startsWith(k.toLowerCase()) && (best === null || k.length > best.length)) best = p;
    }
  }
  return best;
}

export function parseReport(report: string, askedPlaces: string[]): ParseOk | ParseFail {
  const askedKeys = askedPlaces.map((p, i) => ({ i, key: firstWords(p) }));
  for (let i = 0; i < askedKeys.length; i++) {
    for (let j = i + 1; j < askedKeys.length; j++) {
      if (alike(askedKeys[i]!.key, askedKeys[j]!.key)) return { ok: false, reason: "layout" };
    }
  }

  const catBlock = section(report, "Categories");
  const categories = (catBlock.match(/^\d+\.\s+.+$/gm) ?? []).map((l) => cleanValue(l.replace(/^\d+\.\s+/, "")));
  if (categories.length < CATEGORIES_MIN || categories.length > CATEGORIES_MAX) return { ok: false, reason: "layout" };

  const found = new Map<number, ParsedPlace>();
  let dropped = 0;
  for (const chunk of report.split(/^## Place:\s*/m).slice(1)) {
    const name = cleanValue(chunk.split("\n")[0] ?? "");
    const body = chunk.split(/^## /m)[0] ?? "";
    const hit = matchAsked(name, askedKeys);
    if (hit === "ambiguous") return { ok: false, reason: "layout" };
    const parsed = parseItems(body);
    dropped += parsed.dropped;
    if (hit === null) continue;
    const prev = found.get(hit);
    found.set(hit, { askedIndex: hit, name: askedPlaces[hit]!, items: [...(prev?.items ?? []), ...parsed.items] });
  }
  if (found.size !== askedPlaces.length) return { ok: false, reason: "layout" };

  const recParas = section(report, "Recommendation")
    .split(/\n\s*\n/)
    .map(cleanValue)
    .filter((p) => p !== "" && p !== "---");
  const paragraph = recParas[0] ?? "";
  const tradeoffs: { place: string; line: string }[] = [];
  for (const p of recParas.slice(1)) {
    const place = startsWithPlace(p, askedPlaces);
    if (place === null) continue;
    tradeoffs.push({ place, line: tradeoffLine(p, place) });
  }
  const unclear = section(report, "Unclear")
    .split("\n")
    .filter((l) => /^\s*(-|\d+\.)\s+/.test(l))
    .map((l) => cleanValue(l.replace(/^\s*(-|\d+\.)\s+/, "")));

  return {
    ok: true,
    categories,
    places: askedPlaces.map((_, i) => found.get(i)!),
    dropped,
    verdict: { paragraph, tradeoffs },
    unclear,
  };
}
