// The pages: the switch, the form, the states of a comparison's page, and visitor text escaped.
// Every place, authority and page is invented.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSpend } from "../src/core/spend";
import { startPublicComparison } from "../src/compare/create";
import { DAILY_LIMIT, LAYOUT_FAIL, SPEND_STOP, VISITOR_LIMIT } from "../src/compare/words";
import worker from "../src/index";
import { CAFE_CHARS, fitLine, savedActivity, toActivity } from "../src/site/format";
import { callWorker } from "./helpers/app";
import { fetchMock } from "./helpers/fetch-mock";

const T0 = "2026-11-09T10:00:00.000Z";
const PLACES = ["Port Aldren", "Northhaven", "Eastmere"] as const;
const CATS = ["Legal entity registration", "Activity licence", "Premises approval", "Tax registration"] as const;
const NOW = new Date(T0);

async function clean() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM items"),
    env.DB.prepare("DELETE FROM place_sites"),
    env.DB.prepare("DELETE FROM comparisons"),
    env.DB.prepare("DELETE FROM spend"),
    env.DB.prepare("DELETE FROM public_use"),
    env.DB.prepare("UPDATE run_slot SET comparison_id = NULL, since = NULL"),
  ]);
}

beforeEach(async () => {
  await clean();
  fetchMock.activate();
});
afterEach(() => fetchMock.reset());

const page = async (path: string, init?: RequestInit, bindings?: Parameters<typeof callWorker>[2]) => {
  const res = await callWorker(path, init, bindings);
  return { res, html: await res.text() };
};

/** The first screen: the hero through the next section or the end of the page. */
function firstScreen(html: string): string {
  const from = html.indexOf('class="hero"');
  const rest = from < 0 ? html : html.slice(from);
  const next = rest.search(/<section|<footer/);
  return next < 0 ? rest : rest.slice(0, next);
}

async function insertComparison(over: {
  id: string;
  activity?: string;
  state: string;
  kept?: number;
  failed_reason?: string | null;
  sources_count?: number | null;
  research_minutes?: number | null;
}): Promise<void> {
  const ready = over.state === "ready";
  const checking = over.state === "checking" || ready;
  await env.DB.prepare(
    `INSERT INTO comparisons (
       id, activity, places_json, reuse_key, origin, kept, state, failed_reason, dropped_items,
       sources_count, categories_json, verdict_json, unclear_json, research_minutes,
       created_at, started_at, finished_at
     ) VALUES (?, ?, ?, ?, 'admin', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      over.id,
      over.activity ?? "open a small bakery",
      JSON.stringify([...PLACES]),
      `key-${over.id}`,
      over.kept ?? 0,
      over.state,
      over.failed_reason ?? null,
      over.sources_count ?? (ready ? 12 : null),
      checking ? JSON.stringify([...CATS]) : null,
      ready
        ? JSON.stringify({
            paragraph: "Port Aldren is the easiest place to start: fees are published and the wait is short.",
            tradeoffs: [
              { place: "Port Aldren", line: "published fees and a short wait" },
              { place: "Northhaven", line: "a longer wait and more filings" },
              { place: "Eastmere", line: "mixed currencies on the same forms" },
            ],
          })
        : null,
      ready
        ? JSON.stringify([
            "Port Aldren - The premises stamp fee is not on the licensing page.",
            "Northhaven - The food permit page does not say how long an inspection takes.",
            "Eastmere - The shop licence does not say whether seating is included.",
          ])
        : null,
      over.research_minutes ?? (ready ? 7 : null),
      T0,
      T0,
      ready ? T0 : null,
    )
    .run();
}

async function insertItem(over: {
  comparison_id: string;
  place_index: number;
  category_n: number;
  name: string;
  fee?: string;
  time?: string;
  required?: string;
  authority?: string;
  url?: string | null;
  quote?: string;
  check_kind?: string | null;
  check_state?: string;
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
  await env.DB.prepare(
    `INSERT INTO items (
       id, comparison_id, place_index, category_n, name, required, authority, fee, time_to,
       renewal, ongoing, url, host, quote, check_state, check_kind, checked_at, fee_lead_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'annual', 'none', ?, ?, ?, ?, ?, ?, ?)`,
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
      url,
      host,
      over.quote ?? "A bakery needs a food licence from the Aldren Licensing Office, fee USD 300 on the official page.",
      over.check_state ?? (done ? "done" : "unchecked"),
      over.check_kind ?? null,
      done ? T0 : null,
      over.fee_lead === undefined || over.fee_lead === null ? null : JSON.stringify(over.fee_lead),
    )
    .run();
}

/** A kept ready comparison with a gap, a missing cell, mixed fees and a javascript: address. */
async function readyComparison(id = "readygaps001"): Promise<string> {
  await insertComparison({ id, kept: 1, state: "ready" });
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

const formPost = (fields: Record<string, string>, ip = "203.0.113.5") =>
  callWorker("/comparisons", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", "CF-Connecting-IP": ip },
  });

describe("the headline's second line", () => {
  it("keeps the look's size at 15 letters and shrinks at 30, 60 and 200", () => {
    expect("to open a cafe?".length).toBe(CAFE_CHARS);
    expect(fitLine(15, 100)).toBe(100);
    expect(fitLine(30, 100)).toBe(50);
    expect(fitLine(60, 100)).toBe(25);
    expect(fitLine(200, 100)).toBe(7.5);
    expect(fitLine(15, 158.4)).toBe(158.4);
    expect(fitLine(15, 58.5)).toBe(58.5);
    expect(fitLine(30, 158.4)).toBe(79.2);
    expect(fitLine(200, 58.5)).toBeCloseTo(4.3875);
  });
});

describe("the site", () => {
  it("answers nothing while it is switched off", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://redtape.test/"), { ...env, SITE_ENABLED: "0" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("answers a comparison path as JSON 404 while the site is switched off, and keeps the API working", async () => {
    const off = await callWorker("/comparisons/zzzzzzzzzzzz", undefined, { SITE_ENABLED: "0" });
    expect(off.status).toBe(404);
    expect(await off.json()).toEqual({ error: "not_found" });
    const api = await callWorker("/api/comparisons", undefined, { SITE_ENABLED: "0" });
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ comparisons: [] });
  });

  it("serves the home with the form and no featured comparison yet", async () => {
    const { res, html } = await page("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("https://fonts.googleapis.com");
    expect(html).toContain('method="post" action="/comparisons"');
    expect(html).toContain("to start a business?");
    expect(html).toContain(`--n:${toActivity(null).length}`);
    expect(html).toContain("TinyFish Search finds the government sites of each place");
    expect(html).not.toContain("Same row, three places");
    expect(html).not.toContain("This comparison took");
  });

  it("shows the featured comparison on the home", async () => {
    await readyComparison();
    const { html } = await page("/");
    expect(html).toContain("open a small bakery");
    expect(html).toContain("Open a small bakery");
    expect(html).not.toContain('class="law qs"');
    expect(html).toContain("Same row, three places");
    expect(html).toContain("to open a small bakery?");
    expect(html).toContain(`--n:${toActivity("open a small bakery").length}`);
    expect(html).toContain("Shortest tape: Port Aldren");
    expect(html).toContain("This comparison took 7 minutes");
    expect(savedActivity("open a small bakery")).toBe("Open a small bakery");
    expect(savedActivity("Open a small cafe")).toBe("Open a small cafe");
  });

  it("starts a comparison from the form and goes to its page", async () => {
    const res = await formPost({
      activity: "open a small bakery",
      place1: "Port Aldren",
      place2: "Northhaven",
      place3: "Eastmere",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/comparisons\/[a-z0-9]{12}$/);
  });

  it("keeps what was typed and says why when the form is refused", async () => {
    const res = await formPost({
      activity: "open a mill",
      place1: "Port Aldren",
      place2: "Port Aldren Bay",
      place3: "Eastmere",
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Two places start with the same words");
    expect(html).toContain('value="open a mill"');
    expect(html).toContain('value="Port Aldren Bay"');
  });

  it("shows the visitor limit, the daily limit and the spend stop in the form", async () => {
    const fields = { activity: "open a small mill", place1: "Port Aldren", place2: "Northhaven", place3: "Eastmere" };
    expect((await formPost(fields, "203.0.113.1")).status).toBe(303);
    const visitor = await formPost({ ...fields, activity: "open a small kiln" }, "203.0.113.1");
    expect(visitor.status).toBe(429);
    expect(await visitor.text()).toContain("You have started today");

    expect((await formPost({ ...fields, activity: "open a small kiln" }, "203.0.113.2")).status).toBe(303);
    const daily = await formPost({ ...fields, activity: "open a small shop" }, "203.0.113.3");
    expect(daily.status).toBe(429);
    expect(await daily.text()).toMatch(/Today.+s 2 new comparisons are used/);

    await clean();
    fetchMock.activate();
    await recordSpend(env.DB, "research_run", 7, "earlier");
    const spend = await formPost(fields, "203.0.113.9");
    expect(spend.status).toBe(503);
    expect(await spend.text()).toContain(SPEND_STOP);
  });

  it("shows a running comparison alive without script: a refresh and the state in plain words", async () => {
    await insertComparison({ id: "queued000001", state: "queued", activity: "open a small mill" });
    const queued = await page("/comparisons/queued000001");
    expect(queued.html).toContain('<meta http-equiv="refresh" content="5"/>');
    expect(queued.html).toContain("Waiting for the comparison before it to finish.");
    expect(firstScreen(queued.html)).toContain("Waiting for the comparison before it to finish.");

    await insertComparison({ id: "finding00001", state: "finding" });
    const finding = await page("/comparisons/finding00001");
    expect(firstScreen(finding.html)).toContain("Finding the official government sites of each place.");

    await insertComparison({ id: "research0001", state: "researching" });
    const researching = await page("/comparisons/research0001");
    expect(firstScreen(researching.html)).toContain(
      "TinyResearch is reading the official pages. This takes about five to ten minutes.",
    );

    await insertComparison({ id: "checking0001", state: "checking" });
    await insertItem({
      comparison_id: "checking0001",
      place_index: 0,
      category_n: 1,
      name: "Aldren bakery company filing",
      check_kind: "found",
    });
    await insertItem({
      comparison_id: "checking0001",
      place_index: 1,
      category_n: 1,
      name: "Northhaven company roll",
      check_kind: null,
    });
    const checking = await page("/comparisons/checking0001");
    expect(checking.html).toContain('<meta http-equiv="refresh" content="5"/>');
    expect(checking.html).toContain("Reading every official page again to find each quoted sentence.");
    expect(checking.html).toContain("1 of 2 items checked");
    expect(firstScreen(checking.html)).toContain("Reading every official page again to find each quoted sentence.");
    expect(firstScreen(checking.html)).toContain("1 of 2 items checked");
  });

  it("leaves a running comparison unharmed when the key is missing", async () => {
    await insertComparison({ id: "research0001", state: "researching" });
    const snap = await env.DB.prepare(
      "SELECT state, failed_reason, research_run_id, research_started_at FROM comparisons WHERE id = ?",
    )
      .bind("research0001")
      .first();
    const { res, html } = await page("/comparisons/research0001", undefined, { TINYFISH_API_KEY: "" });
    expect(res.status).toBe(200);
    expect(html).toContain("TinyResearch is reading the official pages");
    expect(fetchMock.calls).toHaveLength(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM spend").first<{ n: number }>())?.n).toBe(0);
    expect(
      await env.DB.prepare(
        "SELECT state, failed_reason, research_run_id, research_started_at FROM comparisons WHERE id = ?",
      )
        .bind("research0001")
        .first(),
    ).toEqual(snap);
  });

  it("shows a ready comparison in full with no refresh, open cells, a missing item, not stated, and the disclaimer", async () => {
    const id = await readyComparison();
    const { html } = await page(`/comparisons/${id}`);
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("No item returned");
    expect(html).toContain("not stated");
    expect(html).toContain('class="fee gap"');
    expect(html).toContain("A starting point to confirm with a lawyer, not legal advice.");
    expect(html).toContain("A page on the same site that may hold the fee: Aldren premises fees,");
    expect(html).toContain('class="law qs"');
    expect(firstScreen(html)).toContain("A starting point to confirm with a lawyer, not legal advice.");
  });

  it("shows a failed comparison with its sentence and no grid", async () => {
    await insertComparison({ id: "failed000001", state: "failed", failed_reason: "layout" });
    const { html } = await page("/comparisons/failed000001");
    expect(html).toContain(LAYOUT_FAIL);
    expect(html).not.toContain("Same row, three places");
    expect(html).toContain("/#ask");
    expect(firstScreen(html)).toContain(LAYOUT_FAIL);
    expect(firstScreen(html)).toContain("/#ask");
  });

  it("escapes an activity holding a script tag", async () => {
    await insertComparison({
      id: "scripted0001",
      state: "failed",
      failed_reason: "timeout",
      activity: "bake <script>alert(1)</script> cakes",
    });
    const { html } = await page("/comparisons/scripted0001");
    expect(html).toContain("bake &lt;script&gt;alert(1)&lt;/script&gt; cakes");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("never makes a link from a javascript: address", async () => {
    const id = await readyComparison("jsurl0000001");
    const { html } = await page(`/comparisons/${id}`);
    expect(html).not.toMatch(/href=["']javascript:/i);
    expect(html).toContain("javascript:alert(1)");
  });

  it("answers an unknown comparison with the not-found page", async () => {
    const { res, html } = await page("/comparisons/zzzzzzzzzzzz");
    expect(res.status).toBe(404);
    expect(html).toContain("No comparison here.");
  });

  it("does not open a comparison whose id is not 12 characters", async () => {
    await insertComparison({ id: "demoready0001", state: "ready" });
    const { res, html } = await page("/comparisons/demoready0001");
    expect(res.status).toBe(404);
    expect(html).toContain("No comparison here.");
  });
});

describe("the public form limits", () => {
  it("does not start a comparison when the input is refused", async () => {
    const res = await formPost({
      activity: "open a mill",
      place1: "Port Aldren",
      place2: "Port Aldren Bay",
      place3: "Eastmere",
    });
    expect(res.status).toBe(400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM comparisons").first<{ n: number }>())?.n).toBe(0);
  });

  it("still reuses a stored comparison from the form", async () => {
    const started = await startPublicComparison(env, { activity: "open a small bakery", places: [...PLACES] }, "someone", NOW);
    if (!started.ok) throw new Error(started.error);
    const res = await formPost({
      activity: "open a small bakery",
      place1: "Eastmere",
      place2: "Port Aldren",
      place3: "Northhaven",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/comparisons/${started.id}`);
  });
});
