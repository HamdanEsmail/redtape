// Invented comparisons for page and export tests. Fictional places, authorities and pages.
import { env } from "cloudflare:workers";
import { callWorker } from "./app";

export const T0 = "2026-11-09T10:00:00.000Z";
export const PLACES = ["Port Aldren", "Northhaven", "Eastmere"] as const;
export const CATS = ["Legal entity registration", "Activity licence", "Premises approval", "Tax registration"] as const;

export const DEFAULT_VERDICT = {
  paragraph: "Port Aldren is the easiest place to start: fees are published and the wait is short.",
  tradeoffs: [
    { place: "Port Aldren", line: "published fees and a short wait" },
    { place: "Northhaven", line: "a longer wait and more filings" },
    { place: "Eastmere", line: "mixed currencies on the same forms" },
  ],
};

export async function clean() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM items"),
    env.DB.prepare("DELETE FROM place_sites"),
    env.DB.prepare("DELETE FROM comparisons"),
    env.DB.prepare("DELETE FROM spend"),
    env.DB.prepare("DELETE FROM public_use"),
    env.DB.prepare("UPDATE run_slot SET comparison_id = NULL, since = NULL"),
  ]);
}

export const page = async (path: string, init?: RequestInit, bindings?: Parameters<typeof callWorker>[2]) => {
  const res = await callWorker(path, init, bindings);
  return { res, html: await res.text() };
};

/** The first screen: the hero through the next section or the end of the page. */
export function firstScreen(html: string): string {
  const from = html.indexOf('class="hero"');
  const rest = from < 0 ? html : html.slice(from);
  const next = rest.search(/<section|<footer/);
  return next < 0 ? rest : rest.slice(0, next);
}

export async function insertComparison(over: {
  id: string;
  activity?: string;
  state: string;
  kept?: number;
  demo?: number | null;
  origin?: string;
  failed_reason?: string | null;
  sources_count?: number | null;
  research_minutes?: number | null;
  created_at?: string;
  finished_at?: string | null;
  expires_at?: string | null;
  verdict?: { paragraph: string; tradeoffs: { place: string; line: string }[] } | null;
}): Promise<void> {
  const ready = over.state === "ready";
  const checking = over.state === "checking" || ready;
  const verdict = over.verdict !== undefined ? over.verdict : ready ? DEFAULT_VERDICT : null;
  const created = over.created_at ?? T0;
  const finished = over.finished_at !== undefined ? over.finished_at : ready ? created : null;
  await env.DB.prepare(
    `INSERT INTO comparisons (
       id, activity, places_json, reuse_key, origin, kept, demo, state, failed_reason, dropped_items,
       sources_count, categories_json, verdict_json, unclear_json, research_minutes,
       created_at, started_at, finished_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      over.id,
      over.activity ?? "open a small bakery",
      JSON.stringify([...PLACES]),
      `key-${over.id}`,
      over.origin ?? "admin",
      over.kept ?? 0,
      over.demo ?? null,
      over.state,
      over.failed_reason ?? null,
      over.sources_count ?? (ready ? 12 : null),
      checking ? JSON.stringify([...CATS]) : null,
      verdict === null ? null : JSON.stringify(verdict),
      ready
        ? JSON.stringify([
            "Port Aldren - The premises stamp fee is not on the licensing page.",
            "Northhaven - The food permit page does not say how long an inspection takes.",
            "Eastmere - The shop licence does not say whether seating is included.",
          ])
        : null,
      over.research_minutes ?? (ready ? 7 : null),
      created,
      created,
      finished,
      over.expires_at ?? null,
    )
    .run();
}

export async function insertItem(over: {
  comparison_id: string;
  place_index: number;
  category_n: number;
  name: string;
  fee?: string;
  time?: string;
  required?: string;
  authority?: string;
  renewal?: string;
  ongoing?: string;
  url?: string | null;
  quote?: string;
  check_kind?: string | null;
  check_state?: string;
  checked_at?: string | null;
  fee_lead?: { title: string; url: string } | null;
}): Promise<void> {
  const url = over.url === undefined ? `https://licensing.aldren.gov.example/${over.name.replace(/\s+/g, "-")}` : over.url;
  let host: string | null = null;
  if (url !== null && url !== "") {
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }
  const done = over.check_kind !== null && over.check_kind !== undefined;
  const checked = over.checked_at !== undefined ? over.checked_at : done ? T0 : null;
  await env.DB.prepare(
    `INSERT INTO items (
       id, comparison_id, place_index, category_n, name, required, authority, fee, time_to,
       renewal, ongoing, url, host, quote, check_state, check_kind, checked_at, fee_lead_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      over.comparison_id,
      over.place_index,
      over.category_n,
      over.name,
      over.required ?? "yes",
      over.authority ?? "Aldren Licensing Office",
      over.fee ?? "USD 300",
      over.time ?? "10 days",
      over.renewal ?? "annual",
      over.ongoing ?? "none",
      url,
      host,
      over.quote ?? "A bakery needs a food licence from the Aldren Licensing Office, fee USD 300 on the official page.",
      over.check_state ?? (done ? "done" : "unchecked"),
      over.check_kind ?? null,
      checked,
      over.fee_lead === undefined || over.fee_lead === null ? null : JSON.stringify(over.fee_lead),
    )
    .run();
}

/** A kept ready comparison with a gap, a missing cell, mixed fees and a javascript: address. */
export async function readyComparison(
  id = "readygaps001",
  over?: { verdict?: { paragraph: string; tradeoffs: { place: string; line: string }[] } | null; activity?: string; kept?: number },
): Promise<string> {
  await insertComparison({ id, kept: over?.kept ?? 1, state: "ready", activity: over?.activity, verdict: over?.verdict });
  await insertItem({
    comparison_id: id,
    place_index: 0,
    category_n: 1,
    name: "Aldren bakery company filing",
    fee: "USD 300 (filing); USD 23 name reservation",
    quote: "A bakery files a company form with the Aldren Companies Desk. The fee is USD 300.",
    check_kind: "found",
  });
  await insertItem({
    comparison_id: id,
    place_index: 0,
    category_n: 2,
    name: "Aldren food licence",
    fee: "free",
    check_kind: "found",
  });
  await insertItem({
    comparison_id: id,
    place_index: 0,
    category_n: 3,
    name: "Aldren premises stamp",
    fee: "not stated",
    time: "not stated",
    url: "javascript:alert(1)",
    check_kind: "quote_missing",
    fee_lead: { title: "Aldren premises fees", url: "https://licensing.aldren.gov.example/fees" },
  });
  await insertItem({
    comparison_id: id,
    place_index: 1,
    category_n: 1,
    name: "Northhaven company roll",
    fee: "GBP 100",
    authority: "Northhaven Civic Hall",
    url: "https://permits.northhaven.gov.example/company",
    check_kind: "found_fee_missing",
  });
  await insertItem({
    comparison_id: id,
    place_index: 1,
    category_n: 2,
    name: "Northhaven food permit",
    fee: "not stated",
    authority: "Northhaven Civic Hall",
    url: "https://permits.northhaven.gov.example/food",
    check_kind: "unreadable",
  });
  await insertItem({
    comparison_id: id,
    place_index: 2,
    category_n: 1,
    name: "Eastmere trade licence",
    fee: "USD 200",
    authority: "Eastmere Trade Desk",
    url: "https://trade.eastmere.gov.example/licence",
    check_kind: "found",
  });
  await insertItem({
    comparison_id: id,
    place_index: 2,
    category_n: 2,
    name: "Eastmere shop permit",
    fee: "GBP 50",
    authority: "Eastmere Trade Desk",
    url: "https://trade.eastmere.gov.example/shop",
    check_kind: "found",
  });
  return id;
}
