// A comparison driven through its states against a fake TinyFish, the public limits and the spend stop.
// Every place, authority and page is invented.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSpend, totalSpend } from "../src/core/spend";
import { advance } from "../src/compare/advance";
import { startAdminComparison } from "../src/compare/create";
import { committedSpend } from "../src/compare/money";
import { readSlot } from "../src/compare/slot";
import { failedNotice } from "../src/compare/words";
import { callWorker } from "./helpers/app";
import { fetchMock } from "./helpers/fetch-mock";
import { ASKED, CATS, itemMd, QUOTE, URLS, reportMd } from "./helpers/report";

const T0 = new Date("2026-11-09T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const ACTIVITY = "open a small bakery";
const PLACES = [...ASKED];
const RUN_ID = "01a1c100-0000-7000-8000-00000000bake";
const START = "https://agent.tinyfish.ai/v1/automation/run-research-async";
const WALLET = "https://agent.tinyfish.ai/v1/wallet";
const FETCH = "https://api.fetch.tinyfish.ai";

const PAGES: Record<string, string> = {
  [URLS.aldren]: `${QUOTE}\n\nThe fee is USD 300.`,
  [URLS.north]: "Northhaven requires a food premises permit for every bakery. The fee is USD 300.",
  [URLS.east]: "Eastmere issues a shop licence within five working days. The fee is USD 300.",
};

type Fake = {
  status: string;
  report: string;
  starts: number;
  polls: number;
  placeSearches: number;
  pages: Record<string, string>;
  startStatus: number;
};

function fakeTinyFish(over: Partial<Fake> = {}): Fake {
  const tf: Fake = {
    status: "COMPLETED",
    report: reportMd({}),
    starts: 0,
    polls: 0,
    placeSearches: 0,
    pages: { ...PAGES },
    startStatus: 200,
    ...over,
  };
  fetchMock.intercept({
    method: "GET",
    url: WALLET,
    reply: { json: { available_balance: "20.00", currency: "USD" } },
    times: Infinity,
  });
  fetchMock.intercept({
    method: "POST",
    url: START,
    reply: () => {
      tf.starts += 1;
      if (tf.startStatus !== 200) {
        return Response.json({ error: { code: "FORBIDDEN" } }, { status: tf.startStatus });
      }
      return Response.json({ research_run_id: RUN_ID, error: null });
    },
    times: Infinity,
  });
  fetchMock.intercept({
    method: "GET",
    url: new RegExp("^https://agent\\.tinyfish\\.ai/v1/research-run/"),
    reply: () => {
      tf.polls += 1;
      return Response.json({
        research_run_id: RUN_ID,
        status: tf.status,
        query: "q",
        deep_result: tf.status === "COMPLETED" ? { result: tf.report, citations: [URLS.aldren] } : null,
        evidence: [{ url: URLS.aldren, title: "Bakery", fetched_at: T0.toISOString(), claims: [{ snippet: QUOTE }] }],
        created_at: T0.toISOString(),
        completed_at: tf.status === "COMPLETED" ? T0.toISOString() : null,
        error: null,
      });
    },
    times: Infinity,
  });
  fetchMock.intercept({
    method: "GET",
    url: new RegExp("^https://api\\.search\\.tinyfish\\.ai"),
    reply: (req) => {
      const q = new URL(req.url).searchParams.get("query") ?? "";
      if (q.includes("official government business licence")) tf.placeSearches += 1;
      const results: { url: string; title: string; snippet: string }[] = [];
      if (q.includes("Port Aldren")) results.push({ url: "https://licensing.aldren.gov.example/", title: "Aldren", snippet: "" });
      if (q.includes("Northhaven")) results.push({ url: "https://permits.northhaven.gov.example/", title: "Northhaven", snippet: "" });
      if (q.includes("Eastmere")) results.push({ url: "https://news.eastmere.example/bakery", title: "News", snippet: "" });
      return Response.json({ results });
    },
    times: Infinity,
  });
  fetchMock.intercept({
    method: "POST",
    url: FETCH,
    reply: (_req, body) => {
      const url = typeof body === "object" && body !== null && Array.isArray((body as { urls?: unknown }).urls) ? String((body as { urls: string[] }).urls[0]) : "";
      const text = tf.pages[url];
      if (text === undefined) return Response.json({ results: [], errors: [{ url, error: "bot_blocked" }] });
      return Response.json({ results: [{ text, title: "page", final_url: url }] });
    },
    times: Infinity,
  });
  return tf;
}

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

async function newComparison(now = T0): Promise<string> {
  const r = await startAdminComparison(env, { activity: ACTIVITY, places: PLACES }, null, now);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function toResearching(id: string): Promise<void> {
  expect((await advance(env, id, at(0))).state).toBe("finding");
  expect((await advance(env, id, at(1))).state).toBe("researching");
}

async function researchRunRows(id: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM spend WHERE kind = 'research_run' AND ref = ?").bind(id).first<{ n: number }>();
  return row?.n ?? 0;
}

function missingPlaceReport(): string {
  return reportMd({
    places: [
      { name: "Port Aldren", items: CATS.map((c, n) => itemMd(n + 1, c, c)) },
      { name: "Northhaven", items: CATS.map((c, n) => itemMd(n + 1, c, c, { "Official URL": URLS.north })) },
    ],
  });
}

async function runThrough(id: string, tf: Fake): Promise<string> {
  expect((await advance(env, id, at(0))).state).toBe("finding");
  expect((await advance(env, id, at(1))).state).toBe("researching");
  tf.status = "COMPLETED";
  let state = (await advance(env, id, at(60))).state;
  // checking: 12 items, 4 reads a call
  for (let i = 0; i < 8 && state === "checking"; i++) {
    state = (await advance(env, id, at(61 + i))).state;
  }
  return state;
}

const post = (body: unknown, ip = "203.0.113.1") =>
  callWorker("/api/comparisons", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });

let tf: Fake;
beforeEach(async () => {
  await clean();
  fetchMock.activate();
  tf = fakeTinyFish();
});
afterEach(() => fetchMock.reset());

describe("a comparison from queued to ready", () => {
  it("finds government hosts, starts one research run, checks pages and stores figures", async () => {
    const id = await newComparison();
    expect((await advance(env, id, at(0))).state).toBe("finding");
    expect((await readSlot(env.DB))?.comparison_id).toBe(id);

    const found = await advance(env, id, at(1));
    expect(found.state).toBe("researching");
    expect(tf.starts).toBe(1);
    const sites = await env.DB.prepare("SELECT place_index, host FROM place_sites WHERE comparison_id = ?").bind(id).all<{ place_index: number; host: string }>();
    expect(sites.results.some((s) => s.host === "licensing.aldren.gov.example")).toBe(true);
    expect(sites.results.some((s) => s.host === "news.eastmere.example")).toBe(false);

    tf.status = "COMPLETED";
    expect((await advance(env, id, at(60))).state).toBe("checking");

    let state = "checking";
    for (let i = 0; i < 8 && state === "checking"; i++) state = (await advance(env, id, at(61 + i))).state;
    expect(state).toBe("ready");

    const res = await callWorker(`/api/comparisons/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      state: string;
      categories: string[];
      items: { check_result: string; fee: string; fee_lead: { title: string; url: string } | null }[];
      figures: { place: string; feesSum: string | null }[];
      verdict: { paragraph: string };
      questions: unknown[];
      research_minutes: number | null;
    };
    expect(body.state).toBe("ready");
    expect(body.categories).toHaveLength(4);
    expect(body.items.length).toBeGreaterThanOrEqual(12);
    expect(body.items.some((i) => i.check_result.includes("Read again on 9 Nov 2026: the sentence is on the page."))).toBe(true);
    expect(body.items.every((i) => i.fee_lead === null)).toBe(true);
    expect(body.questions).toEqual([]);
    expect(body.research_minutes).toBe(0);
    expect(body.verdict.paragraph).toMatch(/Port Aldren is the easiest/);
  });

  it("does the same work once when two advance calls run at the same moment", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await advance(env, id, at(0));
    await Promise.all([advance(env, id, at(1)), advance(env, id, at(1))]);
    expect(tf.starts).toBe(1);
    const row = await env.DB.prepare("SELECT state FROM comparisons WHERE id = ?").bind(id).first<{ state: string }>();
    expect(row?.state).toBe("researching");
  });

  it("fails when the research run never ends", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await advance(env, id, at(0));
    await advance(env, id, at(1));
    expect((await advance(env, id, at(60))).state).toBe("researching");
    const late = await advance(env, id, at(26 * 60));
    expect(late.state).toBe("failed");
    const res = await callWorker(`/api/comparisons/${id}`);
    const body = (await res.json()) as { notice: string };
    expect(body.notice).toBe("This comparison did not finish: TinyResearch took too long. Nothing is shown.");
  });

  it("writes checking and the items once when two advance calls see a finished run", async () => {
    const id = await newComparison();
    await advance(env, id, at(0));
    await advance(env, id, at(1));
    tf.status = "COMPLETED";
    await Promise.all([advance(env, id, at(60)), advance(env, id, at(60))]);
    const row = await env.DB.prepare("SELECT state FROM comparisons WHERE id = ?").bind(id).first<{ state: string }>();
    expect(row?.state).toBe("checking");
    const items = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ?").bind(id).first<{ n: number }>();
    expect(items?.n).toBe(12);
  });
});

describe("failedNotice", () => {
  it("has its own sentence for a research failure, and does not use the layout sentence for an unknown reason", () => {
    expect(failedNotice("research_failed")).toBe("This comparison did not finish: the research run failed. Nothing is shown.");
    expect(failedNotice("timeout")).toBe("This comparison did not finish: TinyResearch took too long. Nothing is shown.");
    expect(failedNotice("layout")).toBe("This comparison did not finish: the research did not come back in the agreed layout. Nothing is shown.");
    expect(failedNotice("unknown_reason")).toBe("This comparison did not finish: the research run failed. Nothing is shown.");
    expect(failedNotice(null)).toBe("This comparison did not finish: the research run failed. Nothing is shown.");
  });
});

describe("a research run that does not finish", () => {
  const RESEARCH_FAIL = "This comparison did not finish: the research run failed. Nothing is shown.";

  async function noticeOf(id: string): Promise<string> {
    const res = await callWorker(`/api/comparisons/${id}`);
    return ((await res.json()) as { notice: string }).notice;
  }

  it("fails when the run ends FAILED", async () => {
    const id = await newComparison();
    tf.status = "FAILED";
    await advance(env, id, at(0));
    await advance(env, id, at(1));
    expect((await advance(env, id, at(60))).state).toBe("failed");
    expect(await noticeOf(id)).toBe(RESEARCH_FAIL);
  });

  it("fails when the run ends CANCELLED", async () => {
    const id = await newComparison();
    tf.status = "CANCELLED";
    await advance(env, id, at(0));
    await advance(env, id, at(1));
    expect((await advance(env, id, at(60))).state).toBe("failed");
    expect(await noticeOf(id)).toBe(RESEARCH_FAIL);
  });

  it("fails when the run is COMPLETED with no report", async () => {
    const id = await newComparison();
    tf.status = "COMPLETED";
    tf.report = "";
    await advance(env, id, at(0));
    await advance(env, id, at(1));
    expect((await advance(env, id, at(60))).state).toBe("failed");
    expect(await noticeOf(id)).toBe(RESEARCH_FAIL);
  });

  it("fails when a research start is refused with a status that will not change", async () => {
    tf.startStatus = 403;
    const id = await newComparison();
    await advance(env, id, at(0));
    expect((await advance(env, id, at(1))).state).toBe("failed");
    expect(await noticeOf(id)).toBe(RESEARCH_FAIL);
  });
});

describe("POST /api/comparisons", () => {
  it("allows 2 new comparisons a day in total and 1 per visitor, and reopens a stored one for free", async () => {
    fakeTinyFish();
    const a = await post({ activity: ACTIVITY, places: PLACES });
    expect(a.status).toBe(202);
    const first = (await a.json()) as { id: string; cached: boolean };
    expect(first.cached).toBe(false);

    const again = await post({ activity: "open a small mill", places: PLACES }, "203.0.113.1");
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({
      error: "visitor_limit",
      message: "You have started today's comparison from here already. Saved comparisons still open.",
    });

    expect((await post({ activity: "open a small mill", places: PLACES }, "203.0.113.2")).status).toBe(202);
    const third = await post({ activity: "open a small kiln", places: PLACES }, "203.0.113.3");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({
      error: "daily_limit",
      message: "Today's 2 new comparisons are used. Saved comparisons still open.",
    });

    const reused = await post({ activity: `  ${ACTIVITY.toUpperCase()} `, places: ["Eastmere", "Port Aldren", "Northhaven"] }, "203.0.113.9");
    expect(reused.status).toBe(202);
    expect(await reused.json()).toMatchObject({ id: first.id, cached: true });
  });

  it("closes new comparisons at the spend stop", async () => {
    await recordSpend(env.DB, "research_run", 7, "earlier");
    const res = await post({ activity: ACTIVITY, places: PLACES });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "spend_stop",
      message: "New comparisons are closed: this demo has spent its budget. Saved comparisons still open.",
    });
  });

  it("refuses an activity that is too long or the wrong number of places", async () => {
    expect((await post({ activity: "x".repeat(201), places: PLACES })).status).toBe(400);
    expect((await post({ activity: ACTIVITY, places: ["Port Aldren", "Northhaven"] })).status).toBe(400);
    expect((await post({ activity: ACTIVITY, places: ["Port Aldren", "Northhaven", "x".repeat(81)] })).status).toBe(400);
  });

  it("refuses two places that start with the same words, and does not start a comparison or count it", async () => {
    const res = await post({ activity: ACTIVITY, places: ["Port Aldren", "Port Aldren Bay", "Eastmere"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid",
      field: "places",
      message: "Two places start with the same words. Write each one so it starts differently.",
    });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM comparisons").first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM public_use").first<{ n: number }>())?.n).toBe(0);
  });

  it("refuses the same place twice, and does not start a comparison or count it", async () => {
    const res = await post({ activity: ACTIVITY, places: ["Port Aldren", "Northhaven", "Port Aldren"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid",
      field: "places",
      message: "Two places start with the same words. Write each one so it starts differently.",
    });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM comparisons").first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM public_use").first<{ n: number }>())?.n).toBe(0);
  });

  it("answers 404 while the site is switched off, and 202 when it is on", async () => {
    const off = await callWorker(
      "/api/comparisons",
      {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.1" },
        body: JSON.stringify({ activity: ACTIVITY, places: PLACES }),
      },
      { SITE_ENABLED: "0" },
    );
    expect(off.status).toBe(404);
    expect(await off.json()).toEqual({ error: "not_found" });

    const on = await callWorker(
      "/api/comparisons",
      {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.1" },
        body: JSON.stringify({ activity: ACTIVITY, places: PLACES }),
      },
      { SITE_ENABLED: "1" },
    );
    expect(on.status).toBe(202);
  });

  it("keeps GET and admin import working while the site is switched off", async () => {
    const listed = await callWorker("/api/comparisons", undefined, { SITE_ENABLED: "0" });
    expect(listed.status).toBe(200);

    const stats = await callWorker("/api/stats", undefined, { SITE_ENABLED: "0" });
    expect(stats.status).toBe(200);

    const imported = await callWorker(
      "/admin/import",
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer test-admin" },
        body: JSON.stringify({ run_id: RUN_ID, activity: ACTIVITY, places: PLACES, demo: 1 }),
      },
      { SITE_ENABLED: "0" },
    );
    expect(imported.status).toBe(202);
  });
});

describe("POST /admin/import", () => {
  it("adopts a finished run at no cost and moves it to checking", async () => {
    const res = await callWorker("/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer test-admin" },
      body: JSON.stringify({ run_id: RUN_ID, activity: ACTIVITY, places: PLACES, demo: 1 }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string; state: string };
    expect(body.state).toBe("checking");
    const row = await env.DB.prepare("SELECT origin, cost_usd, cost_basis, kept FROM comparisons WHERE id = ?").bind(body.id).first<{
      origin: string;
      cost_usd: number;
      cost_basis: string;
      kept: number;
    }>();
    expect(row).toMatchObject({ origin: "import", cost_usd: 0, cost_basis: "import", kept: 1 });
    expect(tf.starts).toBe(0);
  });
});

describe("GET /api/stats", () => {
  it("answers from the ledger", async () => {
    const res = await callWorker("/api/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      limits: { spend_stop_usd: 8, public_comparisons_per_day: 2 },
    });
  });
});

describe("a paid run whose comparison then fails is booked", () => {
  async function expectBookedOnce(id: string): Promise<void> {
    expect(await researchRunRows(id)).toBe(1);
    const row = await env.DB.prepare("SELECT cost_basis, run_booked_at FROM comparisons WHERE id = ?").bind(id).first<{
      cost_basis: string | null;
      run_booked_at: string | null;
    }>();
    expect(row?.cost_basis).toMatch(/^(wallet|card|free)$/);
    expect(row?.run_booked_at).not.toBeNull();
    expect(await committedSpend(env.DB)).toBe(await totalSpend(env.DB));
  }

  it("books one ledger row when the run never ends", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await toResearching(id);
    expect((await advance(env, id, at(26 * 60))).state).toBe("failed");
    await expectBookedOnce(id);
  });

  it("books one ledger row when the run ends FAILED", async () => {
    const id = await newComparison();
    tf.status = "FAILED";
    await toResearching(id);
    expect((await advance(env, id, at(60))).state).toBe("failed");
    await expectBookedOnce(id);
  });

  it("books one ledger row when the run ends CANCELLED", async () => {
    const id = await newComparison();
    tf.status = "CANCELLED";
    await toResearching(id);
    expect((await advance(env, id, at(60))).state).toBe("failed");
    await expectBookedOnce(id);
  });

  it("books one ledger row when the run is COMPLETED with no report", async () => {
    const id = await newComparison();
    tf.status = "COMPLETED";
    tf.report = "";
    await toResearching(id);
    expect((await advance(env, id, at(60))).state).toBe("failed");
    await expectBookedOnce(id);
  });

  it("books one ledger row when the report is not in the agreed layout", async () => {
    const id = await newComparison();
    tf.status = "COMPLETED";
    tf.report = missingPlaceReport();
    await toResearching(id);
    expect((await advance(env, id, at(60))).state).toBe("failed");
    await expectBookedOnce(id);
  });

  it("books one ledger row when two advance calls fail the same run at once", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await toResearching(id);
    await Promise.all([advance(env, id, at(26 * 60)), advance(env, id, at(26 * 60))]);
    const row = await env.DB.prepare("SELECT state FROM comparisons WHERE id = ?").bind(id).first<{ state: string }>();
    expect(row?.state).toBe("failed");
    await expectBookedOnce(id);
  });
});

describe("finding and polling are claimed", () => {
  it("makes three place searches, not six, when two advance calls find at once", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await advance(env, id, at(0));
    await Promise.all([advance(env, id, at(1)), advance(env, id, at(1))]);
    expect(tf.placeSearches).toBe(3);
    expect(tf.starts).toBe(1);
    const row = await env.DB.prepare("SELECT state FROM comparisons WHERE id = ?").bind(id).first<{ state: string }>();
    expect(row?.state).toBe("researching");
  });

  it("reads the research run once when two polls fall inside a minute, and again a minute later", async () => {
    const id = await newComparison();
    tf.status = "RUNNING";
    await toResearching(id);
    expect(tf.polls).toBe(0);
    const [a, b] = await Promise.all([advance(env, id, at(60)), advance(env, id, at(60))]);
    expect(a.state).toBe("researching");
    expect(b.state).toBe("researching");
    expect(tf.polls).toBe(1);
    expect((await advance(env, id, at(70))).state).toBe("researching");
    expect(tf.polls).toBe(1);
    expect((await advance(env, id, at(120))).state).toBe("researching");
    expect(tf.polls).toBe(2);
  });
});

describe("a start that may have reached TinyFish is not started again", () => {
  it("fails as research_failed when a start claim is older than the limit and has no run id, and books nothing", async () => {
    tf.startStatus = 429;
    const id = await newComparison();
    await toResearching(id);
    expect(tf.starts).toBe(1);
    await env.DB.prepare("UPDATE comparisons SET research_started_at = ? WHERE id = ?").bind(at(-6 * 60).toISOString(), id).run();
    tf.startStatus = 200;
    const failed = await advance(env, id, at(2));
    expect(failed.state).toBe("failed");
    expect(tf.starts).toBe(1);
    expect(await researchRunRows(id)).toBe(0);
    const row = await env.DB.prepare("SELECT cost_basis, research_run_id, failed_reason FROM comparisons WHERE id = ?").bind(id).first<{
      cost_basis: string | null;
      research_run_id: string | null;
      failed_reason: string | null;
    }>();
    expect(row).toMatchObject({ cost_basis: "none", research_run_id: null, failed_reason: "research_failed" });
  });

  it("tries again when the start call itself answers 429", async () => {
    tf.startStatus = 429;
    const id = await newComparison();
    expect((await advance(env, id, at(0))).state).toBe("finding");
    expect((await advance(env, id, at(1))).state).toBe("researching");
    expect(tf.starts).toBe(1);
    tf.startStatus = 200;
    expect((await advance(env, id, at(2))).state).toBe("researching");
    expect(tf.starts).toBe(2);
    const row = await env.DB.prepare("SELECT research_run_id, state FROM comparisons WHERE id = ?").bind(id).first<{
      research_run_id: string | null;
      state: string;
    }>();
    expect(row).toMatchObject({ research_run_id: RUN_ID, state: "researching" });
  });
});
