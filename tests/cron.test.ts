// The every-minute job. Invented comparisons; every outbound request is answered here.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHECKS_PER_ADVANCE } from "../src/core/limits";
import { runCron } from "../src/cron";
import { clean, insertComparison, insertItem, T0 } from "./helpers/comparison";
import { fetchMock } from "./helpers/fetch-mock";

const NOW = new Date(Date.parse(T0) + 60_000);
const FETCH = "https://api.fetch.tinyfish.ai";

let reads = 0;

beforeEach(async () => {
  await clean();
  reads = 0;
  fetchMock.activate();
  fetchMock.intercept({
    method: "POST",
    url: FETCH,
    times: Infinity,
    reply: (_req, body) => {
      reads += 1;
      const url = String((body as { urls: string[] }).urls[0]);
      return Response.json({ results: [{ text: "A page that does not hold the sentence.", title: "page", final_url: url }] });
    },
  });
});
afterEach(() => fetchMock.reset());

async function checking(id: string, items: number): Promise<void> {
  await insertComparison({ id, state: "checking" });
  for (let n = 0; n < items; n++) {
    await insertItem({ comparison_id: id, place_index: n % 3, category_n: 1 + (n % 4), name: `Item ${n}`, url: `https://licensing.aldren.gov.example/${id}/${n}` });
  }
}

const count = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0;

describe("the every-minute job", () => {
  it("reads a few official pages in one run, however many comparisons are being checked", async () => {
    await checking("checking0001", 6);
    await checking("checking0002", 6);
    await checking("checking0003", 6);
    const out = await runCron(env, NOW);
    expect(out.failed_steps).toEqual([]);
    expect(reads).toBe(CHECKS_PER_ADVANCE);
    expect(await count("SELECT COUNT(*) AS n FROM items WHERE check_state = 'done'")).toBe(CHECKS_PER_ADVANCE);
  });

  it("gets to the end of every comparison over the next runs", async () => {
    await checking("checking0001", 3);
    await checking("checking0002", 3);
    for (let minute = 1; minute <= 4; minute++) await runCron(env, new Date(Date.parse(T0) + minute * 60_000));
    expect(reads).toBe(6);
    expect(await count("SELECT COUNT(*) AS n FROM comparisons WHERE state = 'ready'")).toBe(2);
  });

  it("deletes a visitor's finished comparison past its time, with its items, and keeps a saved one", async () => {
    await insertComparison({ id: "oldvisitor01", state: "ready", origin: "public", expires_at: "2026-11-09T09:00:00.000Z" });
    await insertItem({ comparison_id: "oldvisitor01", place_index: 0, category_n: 1, name: "Old item", check_kind: "found" });
    await insertComparison({ id: "newvisitor01", state: "ready", origin: "public", expires_at: "2026-11-16T09:00:00.000Z" });
    await insertComparison({ id: "saveddemo001", state: "ready", kept: 1, demo: 1 });
    const out = await runCron(env, NOW);
    expect(out.expired).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM comparisons")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM items WHERE comparison_id = 'oldvisitor01'")).toBe(0);
  });
});
