// Watching a saved comparison with TinyFish Monitor. Invented places, pages and Monitor ids; every
// outbound request is answered here.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shownDate } from "../src/core/dates";
import { totalSpend } from "../src/core/spend";
import { runCron } from "../src/cron";
import { callWorker } from "./helpers/app";
import { clean, insertComparison, insertItem, page, readyComparison } from "./helpers/comparison";
import { fetchMock } from "./helpers/fetch-mock";

const MONITORS = "https://agent.tinyfish.ai/v1/monitors";
const FETCH = "https://api.fetch.tinyfish.ai";
const ADMIN = { "content-type": "application/json", Authorization: "Bearer test-admin" };
// The hook stamps a run with the real clock, so the every-minute job is run at times after it.
const START = Date.now();
const at = (minutes: number) => new Date(START + minutes * 60_000);
const day = (minutes: number) => shownDate(at(minutes).toISOString());

const QUOTE = "A bakery files a company form with the Aldren Companies Desk. The fee is USD 300.";
const FILING_URL = "https://licensing.aldren.gov.example/Aldren-bakery-company-filing";

type Fake = { creates: { url: string; body: Record<string, unknown> }[]; deletes: string[]; createStatus: number; pages: Record<string, string | number>; reads: number };

let tf: Fake;

function fake(): Fake {
  const f: Fake = { creates: [], deletes: [], createStatus: 201, pages: {}, reads: 0 };
  fetchMock.intercept({
    method: "POST",
    url: MONITORS,
    times: Infinity,
    reply: (_req, body) => {
      const b = body as Record<string, unknown>;
      f.creates.push({ url: String((b.config as { url: string }).url), body: b });
      if (f.createStatus !== 201) return Response.json({ error: { code: "REFUSED" } }, { status: f.createStatus });
      const n = f.creates.length;
      return Response.json({ monitor: { id: `mon-${n}` }, run: { id: `base-${n}`, results: [{ text: "The page as it stood." }], errors: [] } }, { status: 201 });
    },
  });
  fetchMock.intercept({
    method: "DELETE",
    url: /^https:\/\/agent\.tinyfish\.ai\/v1\/monitors\//,
    times: Infinity,
    reply: (req) => {
      f.deletes.push(new URL(req.url).pathname.split("/").pop()!);
      return Response.json({});
    },
  });
  fetchMock.intercept({
    method: "POST",
    url: FETCH,
    times: Infinity,
    reply: (_req, body) => {
      f.reads += 1;
      const url = String((body as { urls: string[] }).urls[0]);
      const answer = f.pages[url];
      if (typeof answer === "number") return Response.json({ error: { code: "SERVICE_BUSY" } }, { status: answer });
      if (answer === undefined) return Response.json({ results: [], errors: [{ url, error: "bot_blocked" }] });
      return Response.json({ results: [{ text: answer, title: "page", final_url: url }] });
    },
  });
  return f;
}

beforeEach(async () => {
  await clean();
  await env.DB.batch([env.DB.prepare("DELETE FROM watches"), env.DB.prepare("DELETE FROM monitor_runs")]);
  fetchMock.activate();
  tf = fake();
});
afterEach(() => fetchMock.reset());

const watch = (id: string, headers: Record<string, string> = ADMIN) =>
  callWorker("/admin/watch", { method: "POST", headers, body: JSON.stringify({ id }) });

const hook = (payload: unknown, secret = "test-secret") =>
  callWorker(`/hooks/monitor/${secret}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

const rows = async <T>(sql: string) => (await env.DB.prepare(sql).all<T>()).results;
const one = async <T>(sql: string) => env.DB.prepare(sql).first<T>();

/** A saved comparison, watched, with every Monitor created. */
async function watched(): Promise<string> {
  const id = await readyComparison();
  expect((await watch(id)).status).toBe(202);
  for (let minute = 1; minute <= 6; minute++) await runCron(env, at(minute));
  return id;
}

describe("POST /admin/watch", () => {
  it("needs the admin token", async () => {
    const id = await readyComparison();
    const res = await watch(id, { "content-type": "application/json" });
    expect(res.status).toBe(401);
    expect(await rows("SELECT id FROM watches")).toHaveLength(0);
  });

  it("lists the official pages whose fee was stated and found, and creates no Monitor itself", async () => {
    const id = await readyComparison();
    const res = await watch(id);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id, pages: 4, added: 4 });
    const urls = (await rows<{ url: string; status: string }>("SELECT url, status FROM watches ORDER BY url")).map((w) => `${w.status} ${w.url}`);
    expect(urls).toEqual([
      "waiting https://licensing.aldren.gov.example/Aldren-bakery-company-filing",
      "waiting https://licensing.aldren.gov.example/Aldren-food-licence",
      "waiting https://trade.eastmere.gov.example/licence",
      "waiting https://trade.eastmere.gov.example/shop",
    ]);
    expect(tf.creates).toHaveLength(0);
  });

  it("adds nothing the second time", async () => {
    const id = await readyComparison();
    await watch(id);
    expect(await (await watch(id)).json()).toEqual({ id, pages: 4, added: 0 });
  });

  it("watches at most 12 pages in all", async () => {
    await insertComparison({ id: "manypages001", state: "ready", kept: 1 });
    for (let n = 0; n < 15; n++) {
      await insertItem({ comparison_id: "manypages001", place_index: n % 3, category_n: 1 + (n % 4), name: `Permit ${n}`, check_kind: "found" });
    }
    expect(await (await watch("manypages001")).json()).toEqual({ id: "manypages001", pages: 12, added: 12 });
    const other = await readyComparison("otherready01");
    expect(await (await watch(other)).json()).toEqual({ id: other, pages: 0, added: 0 });
  });

  it("refuses a comparison that is not saved or not ready", async () => {
    await insertComparison({ id: "visitor00001", state: "ready", kept: 0 });
    await insertComparison({ id: "running00001", state: "researching", kept: 1 });
    expect((await watch("visitor00001")).status).toBe(409);
    expect((await watch("running00001")).status).toBe(409);
    expect((await watch("nothere00001")).status).toBe(404);
  });
});

describe("creating the Monitors", () => {
  it("creates one Monitor in each run of the every-minute job, on a daily schedule, calling back the hook", async () => {
    const id = await readyComparison();
    await watch(id);
    await runCron(env, at(1));
    expect(tf.creates).toHaveLength(1);
    await runCron(env, at(2));
    expect(tf.creates).toHaveLength(2);
    const first = tf.creates[0]!.body;
    expect(first.type).toBe("fetch");
    expect(first.config).toEqual({ url: tf.creates[0]!.url, format: "markdown" });
    expect(String(first.schedule_cron)).toMatch(/^\d{1,2} 5 \* \* \*$/);
    expect(first.webhook_url).toBe("https://redtape.test/hooks/monitor/test-secret");
    const active = await rows<{ monitor_id: string }>("SELECT monitor_id FROM watches WHERE status = 'active' ORDER BY monitor_id");
    expect(active.map((w) => w.monitor_id)).toEqual(["mon-1", "mon-2"]);
    expect(await totalSpend(env.DB)).toBeCloseTo(0.01, 6);
  });

  it("marks a Monitor that TinyFish refuses as failed and does not ask again", async () => {
    const id = await readyComparison();
    await watch(id);
    tf.createStatus = 422;
    await runCron(env, at(1));
    tf.createStatus = 201;
    for (let minute = 2; minute <= 6; minute++) await runCron(env, at(minute));
    expect(tf.creates).toHaveLength(4);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM watches WHERE status = 'failed'"))?.n).toBe(1);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM watches WHERE status = 'active'"))?.n).toBe(3);
  });

  it("does not send a create call again when its outcome is not known", async () => {
    const id = await readyComparison();
    await watch(id);
    tf.createStatus = 504;
    await runCron(env, at(1));
    tf.createStatus = 201;
    for (let minute = 2; minute <= 6; minute++) await runCron(env, at(minute));
    expect(tf.creates).toHaveLength(4);
    const unknown = await rows<{ url: string }>("SELECT url FROM watches WHERE status = 'unknown'");
    expect(unknown).toHaveLength(1);
    expect(tf.creates.filter((c) => c.url === unknown[0]!.url)).toHaveLength(1);
  });

  it("deletes a Monitor whose first read of the page gave no text, and marks it failed", async () => {
    const id = await readyComparison();
    await watch(id);
    fetchMock.reset();
    fetchMock.activate();
    fetchMock.intercept({
      method: "POST",
      url: MONITORS,
      times: Infinity,
      reply: () => Response.json({ monitor: { id: "mon-blind" }, run: { id: "base-blind", results: [], errors: [{ error: "bot_blocked" }] } }, { status: 201 }),
    });
    const deleted: string[] = [];
    fetchMock.intercept({
      method: "DELETE",
      url: /^https:\/\/agent\.tinyfish\.ai\/v1\/monitors\//,
      times: Infinity,
      reply: (req) => {
        deleted.push(new URL(req.url).pathname.split("/").pop()!);
        return Response.json({});
      },
    });
    await runCron(env, at(1));
    expect(deleted).toEqual(["mon-blind"]);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM watches WHERE status = 'failed' AND monitor_id IS NULL"))?.n).toBe(1);
  });
});

describe("POST /hooks/monitor/:secret", () => {
  it("answers 404 with no body for a wrong secret", async () => {
    await watched();
    const res = await hook({ fetch_monitor_id: "mon-1", id: "run-1", outcome: "changed" }, "not-the-secret");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(await rows("SELECT run_id FROM monitor_runs")).toHaveLength(0);
  });

  it("answers 404 for a Monitor that is not one of its own", async () => {
    await watched();
    const res = await hook({ fetch_monitor_id: "someone-elses", id: "run-1", outcome: "changed" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_monitor" });
    expect(await rows("SELECT run_id FROM monitor_runs")).toHaveLength(0);
  });

  it("answers 400 for a payload it cannot read", async () => {
    await watched();
    expect((await hook({ outcome: "changed" })).status).toBe(400);
    const res = await callWorker("/hooks/monitor/test-secret", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });

  it("books a run once: the same run delivered twice changes nothing more", async () => {
    await watched();
    const before = await totalSpend(env.DB);
    const first = await hook({ fetch_monitor_id: "mon-1", id: "run-7", outcome: "unchanged" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, outcome: "unchanged" });
    const again = await hook({ fetch_monitor_id: "mon-1", id: "run-7", outcome: "unchanged" });
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(await rows("SELECT run_id FROM monitor_runs")).toHaveLength(1);
    expect((await totalSpend(env.DB)) - before).toBeCloseTo(0.005, 6);
  });

  it("reads the run when it sits under `run`, as well as at the top", async () => {
    await watched();
    const res = await hook({ run: { fetch_monitor_id: "mon-2", id: "run-8", outcome: "unchanged" } });
    expect(res.status).toBe(200);
    expect((await one<{ last_outcome: string }>("SELECT last_outcome FROM watches WHERE monitor_id = 'mon-2'"))?.last_outcome).toBe("unchanged");
  });

  it("leaves the items alone when the page did not change", async () => {
    const id = await watched();
    await hook({ fetch_monitor_id: "mon-1", id: "run-9", outcome: "unchanged" });
    await runCron(env, at(10));
    expect(tf.reads).toBe(0);
    const kinds = await rows<{ check_kind: string }>(`SELECT check_kind FROM items WHERE comparison_id = '${id}' AND url = '${FILING_URL}'`);
    expect(kinds.map((k) => k.check_kind)).toEqual(["found"]);
  });
});

describe("a watched page that changed", () => {
  const monitorOf = async (url: string) => (await one<{ monitor_id: string }>(`SELECT monitor_id FROM watches WHERE url = '${url}'`))!.monitor_id;

  it("says so on the item when its sentence is gone, and counts the item as a gap", async () => {
    const id = await watched();
    tf.pages[FILING_URL] = "The Aldren Companies Desk has moved its forms online. Fees are published in the schedule.";
    await hook({ fetch_monitor_id: await monitorOf(FILING_URL), id: "run-20", outcome: "changed", diff: "-The fee is USD 300." });
    await runCron(env, at(20));
    expect(tf.reads).toBe(1);
    const body = (await (await callWorker(`/api/comparisons/${id}`)).json()) as {
      items: { name: string; check_kind: string; check_result: string }[];
      figures: { place: string; gaps: number }[];
      questions: { item: string; kind: string; text: string }[];
    };
    const item = body.items.find((i) => i.name === "Aldren bakery company filing")!;
    expect(item.check_kind).toBe("page_changed");
    expect(item.check_result).toBe(`The official page changed on ${day(20)}: check this item again.`);
    expect(body.figures.find((f) => f.place === "Port Aldren")!.gaps).toBe(2);
    const asked = body.questions.find((q) => q.item === "Aldren bakery company filing" && q.kind === "page_changed");
    expect(asked?.text).toBe(
      `Is Aldren bakery company filing still required in Port Aldren? The official page changed on ${day(20)} and no longer shows the quoted sentence.`,
    );
    await runCron(env, at(21));
    expect(tf.reads).toBe(1);
  });

  it("keeps the item found, with the new day, when its sentence is still there", async () => {
    const id = await watched();
    tf.pages[FILING_URL] = `New opening hours from December. ${QUOTE}`;
    await hook({ fetch_monitor_id: await monitorOf(FILING_URL), id: "run-21", outcome: "changed" });
    await runCron(env, at(60 * 26));
    const item = await one<{ check_kind: string; checked_at: string }>(`SELECT check_kind, checked_at FROM items WHERE comparison_id = '${id}' AND url = '${FILING_URL}'`);
    expect(item).toEqual({ check_kind: "found", checked_at: at(60 * 26).toISOString() });
  });

  it("finds the sentence again when the page puts it back", async () => {
    const id = await watched();
    const monitor = await monitorOf(FILING_URL);
    tf.pages[FILING_URL] = "Nothing about the form.";
    await hook({ fetch_monitor_id: monitor, id: "run-22", outcome: "changed" });
    await runCron(env, at(20));
    tf.pages[FILING_URL] = QUOTE;
    await hook({ fetch_monitor_id: monitor, id: "run-23", outcome: "changed" });
    await runCron(env, at(40));
    const item = await one<{ check_kind: string }>(`SELECT check_kind FROM items WHERE comparison_id = '${id}' AND url = '${FILING_URL}'`);
    expect(item?.check_kind).toBe("found");
  });

  it("tries the page three times when it cannot be read, then says it could not be read", async () => {
    const id = await watched();
    tf.pages[FILING_URL] = 503;
    await hook({ fetch_monitor_id: await monitorOf(FILING_URL), id: "run-24", outcome: "changed" });
    await runCron(env, at(20));
    expect((await one<{ check_kind: string }>(`SELECT check_kind FROM items WHERE comparison_id = '${id}' AND url = '${FILING_URL}'`))?.check_kind).toBe("found");
    await runCron(env, at(21));
    expect(tf.reads).toBe(1);
    await runCron(env, at(26));
    await runCron(env, at(32));
    expect(tf.reads).toBe(3);
    expect((await one<{ check_kind: string }>(`SELECT check_kind FROM items WHERE comparison_id = '${id}' AND url = '${FILING_URL}'`))?.check_kind).toBe("unreadable");
    await runCron(env, at(40));
    expect(tf.reads).toBe(3);
  });
});

describe("POST /admin/unwatch", () => {
  it("deletes each Monitor by its own id, then the rows", async () => {
    const id = await watched();
    const res = await callWorker("/admin/unwatch", { method: "POST", headers: ADMIN, body: JSON.stringify({ id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, deleted: 4 });
    expect(tf.deletes.sort()).toEqual(["mon-1", "mon-2", "mon-3", "mon-4"]);
    expect(await rows("SELECT id FROM watches")).toHaveLength(0);
  });
});

describe("what the pages say about watching", () => {
  it("counts Monitor checks in the public figures and names the watched pages on the comparison", async () => {
    const id = await watched();
    await hook({ fetch_monitor_id: "mon-1", id: "run-30", outcome: "unchanged" });
    const stats = (await (await callWorker("/api/stats")).json()) as { tinyfish: { monitor: { checks: number; usd: number; pages: number } } };
    expect(stats.tinyfish.monitor).toEqual({ checks: 5, usd: 0.025, pages: 4 });

    const view = (await (await callWorker(`/api/comparisons/${id}`)).json()) as { watch: { pages: number; last_run_at: string | null } | null };
    expect(view.watch?.pages).toBe(4);
    expect(view.watch?.last_run_at).not.toBeNull();

    const { html } = await page(`/comparisons/${id}`);
    expect(html).toContain("TinyFish Monitor reads 4 of these official pages again once a day.");
    const about = await page("/about");
    expect(about.html).toContain("5 checks, $0.025");
  });

  it("says nothing about watching on a comparison that is not watched", async () => {
    const id = await readyComparison();
    const { html } = await page(`/comparisons/${id}`);
    expect(html).not.toContain("TinyFish Monitor reads");
    const view = (await (await callWorker(`/api/comparisons/${id}`)).json()) as { watch: unknown };
    expect(view.watch).toBeNull();
  });
});
