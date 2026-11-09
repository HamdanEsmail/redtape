// TinyResearch: start a deep run and read a saved run. A start is $0 on the ledger; the run's
// cost is booked when it ends from what the wallet shows was charged. domain_filter prefers the
// listed hosts and never requires them.
import { PRICES } from "../core/limits";
import type { Env } from "../env";
import { errorCodeOrNull, noteSpend, readJson, TinyFishError, tinyfishFetch } from "./client";

const RESEARCH_API = "https://agent.tinyfish.ai";
const START = `${RESEARCH_API}/v1/automation/run-research-async`;

export type ResearchMode = "deep" | "max";

export type StartResearchInput = {
  query: string;
  mode: ResearchMode;
  /** Hosts to prefer. Omitted or empty: no filter is sent. */
  domainFilter?: string[];
};

export type ResearchStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "unknown";

const STATUSES: readonly ResearchStatus[] = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"];

export type ResearchEvidence = {
  url: string;
  title: string | null;
  fetchedAt: string | null;
  snippets: string[];
};

export type ResearchRun = {
  id: string;
  status: ResearchStatus;
  query: string | null;
  report: string | null;
  citations: string[];
  evidence: ResearchEvidence[];
  createdAt: string | null;
  completedAt: string | null;
  /** A short code when the run failed. Never the upstream sentence. */
  error: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function runError(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const code = value !== null && typeof value === "object" ? (value as { code?: unknown }).code : value;
  return errorCodeOrNull(code) ?? "run_failed";
}

function parseEvidence(value: unknown): ResearchEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: ResearchEvidence[] = [];
  for (const e of value) {
    if (e === null || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const url = str(o.url);
    if (url === null) continue;
    const claims = Array.isArray(o.claims) ? o.claims : [];
    const snippets: string[] = [];
    for (const c of claims) {
      if (c !== null && typeof c === "object") {
        const snip = str((c as { snippet?: unknown }).snippet);
        if (snip !== null) snippets.push(snip);
      }
    }
    out.push({
      url,
      title: str(o.title),
      fetchedAt: str(o.fetched_at),
      snippets,
    });
  }
  return out;
}

function parseRun(body: unknown, fallbackId: string): ResearchRun {
  const d = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = str(d.research_run_id) ?? fallbackId;
  const statusRaw = typeof d.status === "string" ? d.status.toUpperCase() : "";
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as ResearchStatus) : "unknown";
  const deep = d.deep_result !== null && typeof d.deep_result === "object" ? (d.deep_result as Record<string, unknown>) : null;
  const citations = Array.isArray(deep?.citations) ? deep.citations.filter((c): c is string => typeof c === "string") : [];
  return {
    id,
    status,
    query: str(d.query),
    report: str(deep?.result),
    citations,
    evidence: parseEvidence(d.evidence),
    createdAt: str(d.created_at),
    completedAt: str(d.completed_at),
    error: status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT" ? (runError(d.error) ?? "run_failed") : runError(d.error),
  };
}

/**
 * Starts a research run and returns at once. The ledger row is written after the answer, so its
 * ref is the new run's id.
 */
export async function startResearch(env: Env, input: StartResearchInput): Promise<{ id: string }> {
  const body: Record<string, unknown> = { query: input.query, mode: input.mode };
  if (input.domainFilter && input.domainFilter.length > 0) {
    body.domain_filter = { mode: "include", domains: input.domainFilter, block: [] };
  }
  const res = await tinyfishFetch(env, START, { method: "POST", body: JSON.stringify(body) });
  const json = await readJson<{ research_run_id?: unknown }>(res);
  const id = str(json.research_run_id);
  await noteSpend(env, { kind: "research", amountUsd: PRICES.research, ref: id ?? "start" });
  if (id === null) throw new TinyFishError(502, "bad_research", "TinyFish returned a research run without an id");
  return { id };
}

/** The saved run: status, report, citations and evidence. A missing run or one owned by another
 *  account throws (404 or 403). */
export async function getResearch(env: Env, id: string): Promise<ResearchRun> {
  const res = await tinyfishFetch(env, `${RESEARCH_API}/v1/research-run/${encodeURIComponent(id)}`, {
    method: "GET",
    spend: { kind: "research", amountUsd: PRICES.research, ref: id },
  });
  return parseRun(await readJson(res), id);
}
