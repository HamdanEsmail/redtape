// The pages: the switch, the form, the states of a comparison's page, and visitor text escaped.
// Every place, authority and page is invented.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSpend } from "../src/core/spend";
import { startPublicComparison } from "../src/compare/create";
import { LAYOUT_FAIL, SPEND_STOP } from "../src/compare/words";
import {
  PUBLIC_COMPARISONS_PER_DAY,
  PUBLIC_TTL_DAYS,
  SPEND_STOP_USD,
} from "../src/core/limits";
import worker from "../src/index";
import { CAFE_CHARS, fitLine, savedActivity, toActivity } from "../src/site/format";
import { callWorker } from "./helpers/app";
import {
  DEFAULT_VERDICT,
  PLACES,
  T0,
  clean,
  firstScreen,
  insertComparison,
  insertItem,
  page,
  readyComparison,
} from "./helpers/comparison";
import { fetchMock } from "./helpers/fetch-mock";

const NOW = new Date(T0);

beforeEach(async () => {
  await clean();
  fetchMock.activate();
});
afterEach(() => fetchMock.reset());

const formPost = (fields: Record<string, string>, ip = "203.0.113.5") =>
  callWorker("/comparisons", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", "CF-Connecting-IP": ip },
  });

describe("the headline's second line", () => {
  it("keeps the look's size for 15 letters on a desktop and fits 12, 22 and 200 letters at 390 and 1440", () => {
    expect("to open a cafe?".length).toBe(CAFE_CHARS);
    const pages = [
      { width: 390, margin: 20, display: 58.5 },
      { width: 1440, margin: 1440 * 0.032, display: 158.4 },
    ];
    for (const { width, margin, display } of pages) {
      const room = width - 2 * margin;
      for (const n of [12, 22, 200]) {
        const size = fitLine(width, margin, display, n);
        expect(size).toBeLessThanOrEqual(display);
        expect(size * n * 0.45).toBeLessThanOrEqual(room + 1e-9);
        expect(size).toBeCloseTo(Math.min(display, room / (n * 0.45)));
      }
    }
    expect(fitLine(1440, 1440 * 0.032, 158.4, CAFE_CHARS)).toBe(158.4);
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
    expect(firstScreen(queued.html)).not.toContain("See every requirement");
    expect(firstScreen(queued.html)).not.toContain("Shortest tape");

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
    expect(firstScreen(checking.html)).not.toContain("See every requirement");
    expect(firstScreen(checking.html)).not.toContain("Shortest tape");
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
    const id = await readyComparison("readygaps001", {
      verdict: {
        ...DEFAULT_VERDICT,
        paragraph:
          "Port Aldren is the easiest place to start: fees are published and the wait is short. Northhaven asks for more filings.",
      },
    });
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
    const screen = firstScreen(html);
    expect(screen).toContain("Shortest tape");
    expect(screen).toContain("Port Aldren is the easiest place to start: fees are published and the wait is short.");
    expect(screen).not.toContain("Northhaven asks for more filings");
    expect(screen).not.toContain("cannot be judged on cost");
    expect(screen).toContain("See every requirement");
    expect(screen).toContain('href="#grid"');
    const disclaimer = "A starting point to confirm with a lawyer, not legal advice.";
    expect(screen).toContain(disclaimer);
    expect(screen.indexOf("Shortest tape")).toBeLessThan(screen.indexOf("Port Aldren is the easiest place to start"));
    expect(screen.indexOf("Port Aldren is the easiest place to start")).toBeLessThan(screen.indexOf("See every requirement"));
    expect(screen.indexOf("See every requirement")).toBeLessThan(screen.indexOf(disclaimer));
  });

  it("puts Shortest tape on its own line, then the verdict's first sentence", async () => {
    const id = await readyComparison("leadline0001");
    const { html } = await page(`/comparisons/${id}`);
    const screen = firstScreen(html);
    expect(screen).toMatch(/<b>\s*Shortest tape: Port Aldren\s*<\/b>/);
    const heading = screen.match(/<p class="lead">[\s\S]*?<\/p>/g) ?? [];
    expect(heading.some((p) => /Shortest tape: Port Aldren/.test(p) && !/Port Aldren is the easiest/.test(p))).toBe(true);
    expect(heading.some((p) => /Port Aldren is the easiest place to start/.test(p) && !/Shortest tape/.test(p))).toBe(true);
    expect(screen).not.toContain("Shortest tape: Port Aldren Port Aldren");
  });

  it("puts the cost sentence on the first screen only when the named place cannot be judged on cost", async () => {
    const id = "costwarn0001";
    await insertComparison({ id, kept: 1, state: "ready" });
    await insertItem({
      comparison_id: id,
      place_index: 0,
      category_n: 1,
      name: "Aldren bakery company filing",
      fee: "USD 300",
      check_kind: "found",
    });
    for (const n of [2, 3, 4]) {
      await insertItem({
        comparison_id: id,
        place_index: 0,
        category_n: n,
        name: `Aldren extra ${n}`,
        fee: "not stated",
        time: "not stated",
        check_kind: "quote_missing",
      });
    }
    const { html } = await page(`/comparisons/${id}`);
    const screen = firstScreen(html);
    const cost = "Port Aldren cannot be judged on cost: 3 of 4 fees are not stated on official pages.";
    expect(screen).toContain("Shortest tape");
    expect(screen).toContain("Port Aldren is the easiest place to start: fees are published and the wait is short.");
    expect(screen).toContain(cost);
    expect(screen.indexOf("Port Aldren is the easiest place to start")).toBeLessThan(screen.indexOf(cost));
    expect(screen.indexOf(cost)).toBeLessThan(screen.indexOf("See every requirement"));
  });

  it("shows one line per place on the first screen when a ready comparison has no verdict", async () => {
    const id = await readyComparison("noverdict001");
    await env.DB.prepare("UPDATE comparisons SET verdict_json = ? WHERE id = ?")
      .bind(JSON.stringify({ paragraph: "", tradeoffs: [] }), id)
      .run();
    const { html } = await page(`/comparisons/${id}`);
    const screen = firstScreen(html);
    expect(screen).not.toContain("Shortest tape");
    expect(screen).toContain("Port Aldren: 2 of 3 fees stated, at least USD 300, longest stated wait: 10 days.");
    expect(screen).toContain("Northhaven: 1 of 2 fees stated, at least GBP 100, longest stated wait: 10 days.");
    expect(screen).toContain("Eastmere: 2 of 2 fees stated, USD 200; GBP 50, longest stated wait: 10 days.");
    expect(screen).toContain("See every requirement");
    expect(screen.indexOf("Port Aldren: 2 of 3 fees stated")).toBeLessThan(screen.indexOf("See every requirement"));
    expect(screen.indexOf("See every requirement")).toBeLessThan(
      screen.indexOf("A starting point to confirm with a lawyer, not legal advice."),
    );
  });

  it("shows a failed comparison with its sentence and no grid", async () => {
    await insertComparison({ id: "failed000001", state: "failed", failed_reason: "layout" });
    const { html } = await page("/comparisons/failed000001");
    expect(html).toContain(LAYOUT_FAIL);
    expect(html).not.toContain("Same row, three places");
    expect(html).toContain("/#ask");
    expect(firstScreen(html)).toContain(LAYOUT_FAIL);
    expect(firstScreen(html)).toContain("/#ask");
    expect(firstScreen(html)).not.toContain("See every requirement");
    expect(firstScreen(html)).not.toContain("Shortest tape");
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

describe("the lawyer's sheet", () => {
  it("prints the activity, the places, every unclear rule, every question kind, then the items", async () => {
    const id = await readyComparison("sheetready01");
    await insertItem({
      comparison_id: id,
      place_index: 0,
      category_n: 4,
      name: "Aldren tax number",
      fee: "not stated",
      time: "not stated",
      url: null,
      check_kind: "no_url",
    });
    const api = (await (await callWorker(`/api/comparisons/${id}`)).json()) as {
      activity: string;
      places: string[];
      unclear: string[];
      questions: { kind: string; text: string; lead: { title: string; url: string } | null }[];
    };
    const kinds = new Set(api.questions.map((q) => q.kind));
    expect(kinds).toEqual(
      new Set(["fee_not_stated", "time_not_stated", "quote_missing", "fee_not_on_page", "unreadable", "no_url"]),
    );
    const { res, html } = await page(`/comparisons/${id}/brief`);
    expect(res.status).toBe(200);
    expect(html).toContain(api.activity);
    for (const place of api.places) expect(html).toContain(place);
    for (const line of api.unclear) expect(html).toContain(line);
    for (const q of api.questions) expect(html).toContain(q.text);
    expect(html).toContain("A page on the same site that may hold the fee: Aldren premises fees,");
    expect(html).toContain("https://licensing.aldren.gov.example/fees");
    expect(html).toContain("A starting point to confirm with a lawyer, not legal advice.");
    const unclearAt = html.indexOf(api.unclear[0]!);
    const questionAt = html.indexOf(api.questions[0]!.text);
    const itemAt = html.indexOf("Aldren bakery company filing");
    expect(unclearAt).toBeGreaterThan(-1);
    expect(unclearAt).toBeLessThan(questionAt);
    expect(questionAt).toBeLessThan(itemAt);
  });

  it("shows the state sentence and a link to the comparison when it is not ready", async () => {
    await insertComparison({ id: "queued000001", state: "queued" });
    const queued = await page("/comparisons/queued000001/brief");
    expect(queued.res.status).toBe(200);
    expect(queued.html).toContain("Waiting for the comparison before it to finish.");
    expect(queued.html).toContain('href="/comparisons/queued000001"');
    expect(queued.html).not.toContain("What is the fee for");

    await insertComparison({ id: "failed000001", state: "failed", failed_reason: "layout" });
    const failed = await page("/comparisons/failed000001/brief");
    expect(failed.html).toContain(LAYOUT_FAIL);
    expect(failed.html).toContain('href="/comparisons/failed000001"');
  });
});

describe("saved comparisons", () => {
  it("lists kept ready comparisons and recent visitor ones, newest first, and not expired ones", async () => {
    await insertComparison({
      id: "keptold00001",
      state: "ready",
      kept: 1,
      activity: "open a small bakery",
      created_at: "2026-11-08T10:00:00.000Z",
      finished_at: "2026-11-08T10:10:00.000Z",
    });
    await insertComparison({
      id: "keptnew00001",
      state: "ready",
      kept: 1,
      activity: "run a small mill",
      created_at: "2026-11-09T09:00:00.000Z",
      finished_at: "2026-11-09T09:10:00.000Z",
    });
    await insertComparison({
      id: "visitnew0001",
      state: "ready",
      kept: 0,
      origin: "public",
      activity: "open a small kiln",
      created_at: "2026-11-09T12:00:00.000Z",
      finished_at: "2026-11-09T12:10:00.000Z",
      expires_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    });
    await insertComparison({
      id: "visitold0001",
      state: "ready",
      kept: 0,
      origin: "public",
      activity: "open a small stall",
      created_at: "2026-11-01T10:00:00.000Z",
      finished_at: "2026-11-01T10:10:00.000Z",
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const { res, html } = await page("/comparisons");
    expect(res.status).toBe(200);
    expect(html).toContain("Open a small kiln");
    expect(html).toContain("Run a small mill");
    expect(html).toContain("Open a small bakery");
    expect(html).not.toContain("Open a small stall");
    expect(html).toContain("checked 9 Nov 2026");
    expect(html).toContain(`${PUBLIC_TTL_DAYS} days`);
    expect(html.indexOf("Open a small kiln")).toBeLessThan(html.indexOf("Run a small mill"));
    expect(html.indexOf("Run a small mill")).toBeLessThan(html.indexOf("Open a small bakery"));
  });
});

describe("about, how, api and not found", () => {
  it("reads spend from the ledger on the about page", async () => {
    await recordSpend(env.DB, "research_run", 2, "run-1");
    await recordSpend(env.DB, "fetch", 0, "page-a");
    await recordSpend(env.DB, "fetch", 0, "page-b");
    await recordSpend(env.DB, "search", 0, "find-a");
    const { res, html } = await page("/about");
    expect(res.status).toBe(200);
    expect(html).toContain("$2.00");
    expect(html).toContain("2 reads");
    expect(html).toContain("1 search");
    expect(html).toContain(`$${SPEND_STOP_USD.toFixed(2)}`);
    expect(html).toContain(`${PUBLIC_COMPARISONS_PER_DAY} new comparisons`);
    expect(html).toContain("salted hash");
    expect(html).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
  });

  it("serves how it works and the API page", async () => {
    const how = await page("/how");
    expect(how.res.status).toBe(200);
    expect(how.html).toContain("Find");
    expect(how.html).toContain("government domain");
    expect(how.html).toContain("Read again on 9 Nov 2026: the sentence is on the page.");
    expect(how.html).toContain("not stated");
    expect(how.html).toContain("Currencies are never converted");

    await readyComparison("apiready0001");
    const api = await page("/api");
    expect(api.res.status).toBe(200);
    expect(api.html).toContain("curl");
    expect(api.html).toContain("/api/comparisons");
    expect(api.html).toContain("No key is needed to read");
    expect(api.html).toContain("https://redtape.test/api/comparisons/apiready0001");
  });

  it("answers 404 in the shell for an unknown page path and an unknown id, and JSON for an API path", async () => {
    const missing = await page("/no-such-page");
    expect(missing.res.status).toBe(404);
    expect(missing.html).toContain("There is no page here.");
    expect(missing.html).not.toContain("No comparison here.");
    expect(missing.html).toContain('href="/"');
    expect(missing.html).toContain('href="/comparisons"');

    const unknown = await page("/comparisons/zzzzzzzzzzzz");
    expect(unknown.res.status).toBe(404);
    expect(unknown.html).toContain("No comparison here.");
    expect(unknown.html).not.toContain("There is no page here.");

    const api = await callWorker("/api/nope");
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: "not_found" });
  });

  it("puts title, description, canonical, Open Graph, Twitter and favicon tags on a page", async () => {
    const { html } = await page("/");
    expect(html).toContain('rel="canonical" href="https://redtape.test/"');
    expect(html).toContain('property="og:image" content="https://redtape.test/assets/social.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('href="/favicon.svg"');
  });
});

describe("every page behind the switch", () => {
  it("answers JSON 404 for the other screens while the site is switched off", async () => {
    const paths = ["/how", "/about", "/api", "/comparisons", "/comparisons/queued000001/brief"];
    for (const path of paths) {
      const res = await callWorker(path, undefined, { SITE_ENABLED: "0" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
  });
});
