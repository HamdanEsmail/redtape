import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickFeeLead } from "../src/brief/lead";
import { advance } from "../src/compare/advance";
import { startAdminComparison } from "../src/compare/create";
import { FEE_LEADS_PER_COMPARISON } from "../src/core/limits";
import { callWorker } from "./helpers/app";
import { fetchMock } from "./helpers/fetch-mock";
import { ASKED, CATS, itemMd, QUOTE, reportMd, URLS } from "./helpers/report";

const T0 = new Date("2026-11-09T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const ACTIVITY = "open a small bakery";
const PLACES = [...ASKED];
const RUN_ID = "01a1c100-0000-7000-8000-00000000lead";
const START = "https://agent.tinyfish.ai/v1/automation/run-research-async";
const WALLET = "https://agent.tinyfish.ai/v1/wallet";
const FETCH = "https://api.fetch.tinyfish.ai";
const SEARCH = /^https:\/\/api\.search\.tinyfish\.ai/;

const PAGES: Record<string, string> = {
  [URLS.aldren]: `${QUOTE}\n\nFees are listed separately.`,
  [URLS.north]: "Northhaven requires a food premises permit for every bakery.",
  [URLS.east]: "Eastmere issues a shop licence within five working days.",
};

type LeadHit = { url: string; title: string };

type Fake = {
  status: string;
  report: string;
  pages: Record<string, string>;
  createdAt: string;
  completedAt: string | null;
  leadHits: LeadHit[];
  leadByQuery: (q: string) => LeadHit[];
  searchFail: boolean;
  feeScheduleQueries: string[];
};

function fakeTinyFish(over: Partial<Fake> = {}): Fake {
  const tf: Fake = {
    status: "COMPLETED",
    report: reportMd({}),
    pages: { ...PAGES },
    createdAt: T0.toISOString(),
    completedAt: new Date(T0.getTime() + 7 * 60_000).toISOString(),
    leadHits: [],
    leadByQuery: (q) => (q.includes("fee schedule") ? tf.leadHits : []),
    searchFail: false,
    feeScheduleQueries: [],
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
    reply: { json: { research_run_id: RUN_ID, error: null } },
    times: Infinity,
  });
  fetchMock.intercept({
    method: "GET",
    url: new RegExp("^https://agent\\.tinyfish\\.ai/v1/research-run/"),
    reply: () =>
      Response.json({
        research_run_id: RUN_ID,
        status: tf.status,
        query: "q",
        deep_result: tf.status === "COMPLETED" ? { result: tf.report, citations: [URLS.aldren] } : null,
        evidence: [{ url: URLS.aldren, title: "Bakery", fetched_at: T0.toISOString(), claims: [{ snippet: QUOTE }] }],
        created_at: tf.createdAt,
        completed_at: tf.completedAt,
        error: null,
      }),
    times: Infinity,
  });
  fetchMock.intercept({
    method: "GET",
    url: SEARCH,
    reply: (req) => {
      const q = new URL(req.url).searchParams.get("query") ?? "";
      if (q.includes("fee schedule")) {
        tf.feeScheduleQueries.push(q);
        if (tf.searchFail) return Response.json({ error: { code: "BUSY" } }, { status: 503 });
        return Response.json({ results: tf.leadByQuery(q).map((h) => ({ ...h, snippet: "" })) });
      }
      const results: { url: string; title: string; snippet: string }[] = [];
      if (q.includes("Port Aldren")) results.push({ url: "https://licensing.aldren.gov.example/", title: "Aldren", snippet: "" });
      if (q.includes("Northhaven")) results.push({ url: "https://permits.northhaven.gov.example/", title: "Northhaven", snippet: "" });
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

function gapReport(notStated: number): string {
  let left = notStated;
  const places = ASKED.map((name, i) => ({
    name,
    items: CATS.map((cat, n) => {
      const fee = left > 0 ? "not stated" : "USD 300";
      if (left > 0) left--;
      return itemMd(n + 1, cat, `${name} ${cat}`, {
        Authority: i === 0 ? "Aldren Licensing Office" : i === 1 ? "Northhaven Civic Hall" : "Eastmere Trade Desk",
        Fee: fee,
        "Official URL": i === 0 ? URLS.aldren : i === 1 ? URLS.north : URLS.east,
        Quote: i === 0 ? QUOTE : i === 1 ? "Northhaven requires a food premises permit for every bakery." : "Eastmere issues a shop licence within five working days.",
      });
    }),
  }));
  return reportMd({ places });
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

async function drive(id: string, now = at(60)): Promise<string> {
  let state = (await advance(env, id, now)).state;
  for (let i = 0; i < 20 && (state === "queued" || state === "finding" || state === "researching" || state === "checking"); i++) {
    state = (await advance(env, id, new Date(now.getTime() + (i + 1) * 1000))).state;
  }
  return state;
}

let tf: Fake;
beforeEach(async () => {
  await clean();
  fetchMock.activate();
  tf = fakeTinyFish();
});
afterEach(() => fetchMock.reset());

describe("pickFeeLead", () => {
  const host = "licensing.aldren.gov.example";

  it("keeps a lead on the item's own host", () => {
    expect(
      pickFeeLead(
        [
          { url: "https://licensing.aldren.gov.example/fees", title: "Aldren fee schedule", snippet: "" },
          { url: "https://other.gov.example/fees", title: "Other", snippet: "" },
        ],
        host,
      ),
    ).toEqual({ title: "Aldren fee schedule", url: "https://licensing.aldren.gov.example/fees" });
  });

  it("keeps a lead on a subdomain of the item's host", () => {
    expect(
      pickFeeLead([{ url: "https://fees.licensing.aldren.gov.example/2026", title: "2026 schedule", snippet: "" }], host),
    ).toEqual({ title: "2026 schedule", url: "https://fees.licensing.aldren.gov.example/2026" });
  });

  it("returns none when no result is on the item's host", () => {
    expect(pickFeeLead([{ url: "https://news.eastmere.example/fees", title: "News", snippet: "" }], host)).toBe(null);
  });

  it("ignores a result on another host and keeps the first that matches", () => {
    expect(
      pickFeeLead(
        [
          { url: "https://directory.example/aldren-fees", title: "Directory", snippet: "" },
          { url: "https://www.licensing.aldren.gov.example/schedule", title: "Official schedule", snippet: "" },
        ],
        host,
      ),
    ).toEqual({ title: "Official schedule", url: "https://www.licensing.aldren.gov.example/schedule" });
  });
});

describe("fee leads in advance", () => {
  it("stores a lead found on the item's host, and does not change the fee or the figures", async () => {
    tf.report = gapReport(1);
    tf.leadHits = [{ url: "https://licensing.aldren.gov.example/fees", title: "Aldren fee schedule" }];
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");

    const item = await env.DB.prepare("SELECT name, fee, check_kind, fee_lead_json FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%'").bind(id).first<{
      name: string;
      fee: string;
      check_kind: string;
      fee_lead_json: string;
    }>();
    expect(item?.fee).toBe("not stated");
    expect(item?.check_kind).toBe("found");
    expect(JSON.parse(item!.fee_lead_json)).toEqual({ title: "Aldren fee schedule", url: "https://licensing.aldren.gov.example/fees" });

    const res = await callWorker(`/api/comparisons/${id}`);
    const body = (await res.json()) as {
      research_minutes: number | null;
      questions: { kind: string; lead: { title: string; url: string } | null }[];
      items: { name: string; fee: string; fee_lead: { title: string; url: string } | null }[];
      figures: { feesNotStated: number }[];
    };
    expect(body.research_minutes).toBe(7);
    const gap = body.items.find((i) => i.fee.startsWith("not stated"));
    expect(gap?.fee_lead).toEqual({ title: "Aldren fee schedule", url: "https://licensing.aldren.gov.example/fees" });
    expect(body.questions.some((q) => q.kind === "fee_not_stated" && q.lead?.title === "Aldren fee schedule")).toBe(true);
    expect(body.figures[0]?.feesNotStated).toBeGreaterThanOrEqual(1);
    expect(tf.feeScheduleQueries.some((q) => q.includes("fee schedule site:licensing.aldren.gov.example"))).toBe(true);
  });

  it("stores a lead found on a subdomain of the item's host", async () => {
    tf.report = gapReport(1);
    tf.leadHits = [{ url: "https://fees.licensing.aldren.gov.example/list", title: "Subdomain schedule" }];
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");
    const row = await env.DB.prepare("SELECT fee_lead_json FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%'").bind(id).first<{ fee_lead_json: string }>();
    expect(JSON.parse(row!.fee_lead_json)).toEqual({ title: "Subdomain schedule", url: "https://fees.licensing.aldren.gov.example/list" });
  });

  it("stores none found when no result is on the item's host", async () => {
    tf.report = gapReport(1);
    tf.leadHits = [{ url: "https://news.eastmere.example/fees", title: "News" }];
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");
    const row = await env.DB.prepare("SELECT fee_lead_json FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%'").bind(id).first<{ fee_lead_json: string }>();
    expect(row?.fee_lead_json).toBe("none found");
    const res = await callWorker(`/api/comparisons/${id}`);
    const body = (await res.json()) as { items: { fee: string; fee_lead: unknown }[]; questions: { kind: string; lead: unknown }[] };
    expect(body.items.find((i) => i.fee.startsWith("not stated"))?.fee_lead).toBe(null);
    expect(body.questions.find((q) => q.kind === "fee_not_stated")?.lead).toBe(null);
  });

  it("ignores a result on another host", async () => {
    tf.report = gapReport(1);
    tf.leadHits = [
      { url: "https://directory.example/aldren-fees", title: "Directory" },
      { url: "https://licensing.aldren.gov.example/fees", title: "Official" },
    ];
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");
    const row = await env.DB.prepare("SELECT fee_lead_json FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%'").bind(id).first<{ fee_lead_json: string }>();
    expect(JSON.parse(row!.fee_lead_json)).toEqual({ title: "Official", url: "https://licensing.aldren.gov.example/fees" });
  });

  it("stores none found when the search fails, and the comparison still becomes ready", async () => {
    tf.report = gapReport(1);
    tf.searchFail = true;
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");
    const row = await env.DB.prepare("SELECT fee_lead_json, fee FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%'").bind(id).first<{
      fee_lead_json: string;
      fee: string;
    }>();
    expect(row?.fee).toBe("not stated");
    expect(row?.fee_lead_json).toBe("none found");
  });

  it("searches at most 6 items per comparison", async () => {
    tf.report = gapReport(7);
    tf.leadHits = [{ url: "https://licensing.aldren.gov.example/fees", title: "Aldren fee schedule" }];
    const id = await newComparison();
    expect(await drive(id, at(0))).toBe("ready");
    expect(tf.feeScheduleQueries).toHaveLength(FEE_LEADS_PER_COMPARISON);
    const counted = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ? AND fee_lead_json IS NOT NULL").bind(id).first<{ n: number }>();
    expect(counted?.n).toBe(FEE_LEADS_PER_COMPARISON);
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ? AND fee LIKE 'not stated%' AND fee_lead_json IS NULL").bind(id).first<{ n: number }>();
    expect(open?.n).toBe(1);
  });

  it("searches each item once when two advance calls run at the same moment", async () => {
    tf.report = gapReport(2);
    tf.leadHits = [{ url: "https://licensing.aldren.gov.example/fees", title: "Aldren fee schedule" }];
    const id = await newComparison();
    expect((await advance(env, id, at(0))).state).toBe("finding");
    expect((await advance(env, id, at(1))).state).toBe("researching");
    tf.status = "COMPLETED";
    let state = (await advance(env, id, at(60))).state;
    while (state === "checking") {
      const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ? AND check_state IN ('unchecked', 'checking')").bind(id).first<{ n: number }>();
      if ((pending?.n ?? 0) === 0) break;
      state = (await advance(env, id, at(61))).state;
    }
    expect(tf.feeScheduleQueries).toHaveLength(0);
    const [a, b] = await Promise.all([advance(env, id, at(70)), advance(env, id, at(70))]);
    expect(["checking", "ready"]).toContain(a.state);
    expect(["checking", "ready"]).toContain(b.state);
    expect(tf.feeScheduleQueries).toHaveLength(2);
    const searched = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE comparison_id = ? AND fee_lead_json IS NOT NULL").bind(id).first<{ n: number }>();
    expect(searched?.n).toBe(2);
  });
});

describe("research_minutes on import", () => {
  it("stores whole minutes between the run's created_at and completed_at", async () => {
    const res = await callWorker("/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer test-admin" },
      body: JSON.stringify({ run_id: RUN_ID, activity: ACTIVITY, places: PLACES, demo: 1 }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string };
    const row = await env.DB.prepare("SELECT research_minutes FROM comparisons WHERE id = ?").bind(body.id).first<{ research_minutes: number | null }>();
    expect(row?.research_minutes).toBe(7);
  });
});
