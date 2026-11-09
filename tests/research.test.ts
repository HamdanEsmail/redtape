// The TinyResearch client against invented answers in the shape of the real ones.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TinyFishError } from "../src/tinyfish/client";
import { getResearch, startResearch } from "../src/tinyfish/research";
import { fetchMock } from "./helpers/fetch-mock";

const START = "https://agent.tinyfish.ai/v1/automation/run-research-async";
const RUN_ID = "01a1c100-0000-7000-8000-00000000cafe";
const GET = `https://agent.tinyfish.ai/v1/research-run/${RUN_ID}`;
const QUERY = "What does it take to open a small bakery in each of these places: Port Aldren; Northhaven; Eastmere?";

type SpendRow = { kind: string; amount_usd: number; ref: string };
async function spendRows(): Promise<SpendRow[]> {
  const { results } = await env.DB.prepare("SELECT kind, amount_usd, ref FROM spend ORDER BY at, rowid").all<SpendRow>();
  return results;
}

const runBody = (over: Record<string, unknown> = {}) => ({
  research_run_id: RUN_ID,
  status: "RUNNING",
  query: QUERY,
  deep_result: null,
  created_at: "2026-11-09T10:00:00.000Z",
  completed_at: null,
  evidence: [],
  error: null,
  ...over,
});

beforeEach(async () => {
  fetchMock.activate();
  await env.DB.prepare("DELETE FROM spend").run();
});
afterEach(() => fetchMock.reset());

describe("startResearch", () => {
  it("starts a deep run with preferred domains, never required, and books a $0 call under the new id", async () => {
    let apiKey: string | null = null;
    fetchMock.intercept({
      method: "POST",
      url: START,
      reply: (req) => {
        apiKey = req.headers.get("X-API-Key");
        return Response.json({ research_run_id: RUN_ID, error: null });
      },
    });

    const started = await startResearch(env, {
      query: QUERY,
      mode: "deep",
      domainFilter: ["licensing.aldren.gov.example", "gov.northhaven.example"],
    });

    expect(apiKey).toBe("test-tinyfish-key");
    expect(fetchMock.calls[0]!.body).toEqual({
      query: QUERY,
      mode: "deep",
      domain_filter: { mode: "include", domains: ["licensing.aldren.gov.example", "gov.northhaven.example"], block: [] },
    });
    expect(started).toEqual({ id: RUN_ID });
    expect(await spendRows()).toEqual([{ kind: "research", amount_usd: 0, ref: RUN_ID }]);
  });

  it("omits the domain filter when none are given", async () => {
    fetchMock.intercept({ method: "POST", url: START, reply: { json: { research_run_id: RUN_ID, error: null } } });
    await startResearch(env, { query: QUERY, mode: "deep" });
    expect(fetchMock.calls[0]!.body).toEqual({ query: QUERY, mode: "deep" });
  });

  it("throws a 403 at once, without waiting or trying again, and books nothing", async () => {
    fetchMock.intercept({
      method: "POST",
      url: START,
      reply: { status: 403, json: { error: { code: "FORBIDDEN", message: "Research isn't enabled for this account" } } },
      times: 5,
    });
    const err = await startResearch(env, { query: QUERY, mode: "deep" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TinyFishError);
    expect((err as TinyFishError).status).toBe(403);
    expect((err as TinyFishError).code).toBe("FORBIDDEN");
    expect(fetchMock.calls).toHaveLength(1);
    expect(await spendRows()).toEqual([]);
  });
});

describe("getResearch", () => {
  it("reads a run in progress", async () => {
    fetchMock.intercept({ method: "GET", url: GET, reply: { json: runBody() } });
    const run = await getResearch(env, RUN_ID);
    expect(run).toMatchObject({
      id: RUN_ID,
      status: "RUNNING",
      query: QUERY,
      report: null,
      completedAt: null,
    });
    expect(await spendRows()).toEqual([{ kind: "research", amount_usd: 0, ref: RUN_ID }]);
  });

  it("reads a finished run's report, citations and evidence", async () => {
    fetchMock.intercept({
      method: "GET",
      url: GET,
      reply: {
        json: runBody({
          status: "COMPLETED",
          completed_at: "2026-11-09T10:07:00.000Z",
          deep_result: {
            result: "## Categories\n1. Licence",
            citations: ["https://licensing.aldren.gov.example/bakery"],
          },
          evidence: [
            {
              url: "https://licensing.aldren.gov.example/bakery",
              title: "Bakery licence",
              fetched_at: "2026-11-09T10:04:00.000Z",
              claims: [{ snippet: "A bakery needs a food licence." }],
            },
          ],
        }),
      },
    });
    const run = await getResearch(env, RUN_ID);
    expect(run.status).toBe("COMPLETED");
    expect(run.report).toBe("## Categories\n1. Licence");
    expect(run.citations).toEqual(["https://licensing.aldren.gov.example/bakery"]);
    expect(run.evidence).toEqual([
      {
        url: "https://licensing.aldren.gov.example/bakery",
        title: "Bakery licence",
        fetchedAt: "2026-11-09T10:04:00.000Z",
        snippets: ["A bakery needs a food licence."],
      },
    ]);
    expect(run.completedAt).toBe("2026-11-09T10:07:00.000Z");
  });

  it("reads a failed run as a short code, never the upstream sentence", async () => {
    fetchMock.intercept({
      method: "GET",
      url: GET,
      reply: {
        json: runBody({
          status: "FAILED",
          error: { code: "TASK_FAILED", message: "Pipeline exploded on query: " + QUERY },
        }),
      },
    });
    const run = await getResearch(env, RUN_ID);
    expect(run.status).toBe("FAILED");
    expect(run.report).toBe(null);
    expect(run.error).toBe("TASK_FAILED");
    expect(JSON.stringify(run)).not.toContain("Pipeline exploded");
  });

  it("throws a 403 at once and books nothing", async () => {
    fetchMock.intercept({
      method: "GET",
      url: GET,
      reply: { status: 403, json: { error: { code: "FORBIDDEN", message: "belongs to another user" } } },
    });
    const err = await getResearch(env, RUN_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TinyFishError);
    expect((err as TinyFishError).status).toBe(403);
    expect((err as TinyFishError).code).toBe("FORBIDDEN");
    expect(await spendRows()).toEqual([]);
  });
});
