// TinyFish Monitor: a Page Monitor reads one public page on a schedule and calls a webhook with
// what it found. Creating one runs a first read at once and returns it in the 201 body (the
// webhook is not called for it). Each read costs PRICES.monitor_check.
import { PRICES } from "../core/limits";
import type { Env } from "../env";
import { readJson, TinyFishError, tinyfishFetch } from "./client";

const MONITORS_API = "https://agent.tinyfish.ai/v1/monitors";

const monitorUrl = (id: string) => `${MONITORS_API}/${encodeURIComponent(id)}`;

export type CreateMonitorParams = {
  url: string;
  name: string;
  /** Five fields, UTC. */
  scheduleCron: string;
  purpose: string;
  webhookUrl: string;
};

type CreateBody = {
  monitor?: { id?: unknown };
  run?: { results?: { text?: unknown }[]; errors?: unknown[] };
};

/**
 * Creates a Page Monitor and returns its id. When TinyFish answers 201 but its first read gave no
 * text (the page is blocked or empty), the Monitor would report nothing useful: it is deleted
 * again and a `baseline_failed` error is thrown, so no Monitor is left running and billed for
 * nothing. A 201 with no id is a `no_monitor_id` error: a Monitor may exist that cannot be named.
 */
export async function createMonitor(env: Env, p: CreateMonitorParams): Promise<{ monitorId: string }> {
  const res = await tinyfishFetch(env, MONITORS_API, {
    method: "POST",
    body: JSON.stringify({
      type: "fetch",
      name: p.name,
      config: { url: p.url, format: "markdown" },
      schedule_cron: p.scheduleCron,
      purpose: p.purpose,
      webhook_url: p.webhookUrl,
    }),
    // The first read is a completed check.
    spend: { kind: "monitor_check", amountUsd: PRICES.monitor_check, ref: p.url },
  });
  const body = await readJson<CreateBody>(res);
  const monitorId = typeof body.monitor?.id === "string" && body.monitor.id !== "" ? body.monitor.id : null;
  if (monitorId === null) throw new TinyFishError(502, "no_monitor_id", "TinyFish created a monitor without an id");

  const text = body.run?.results?.[0]?.text;
  const failed = body.run?.errors?.length ?? 0;
  if (typeof text === "string" && text !== "" && failed === 0) return { monitorId };

  try {
    await deleteMonitor(env, monitorId);
  } catch {
    // Best effort. The caller still gets baseline_failed.
  }
  throw new TinyFishError(422, "baseline_failed", "TinyFish created the monitor but its first read returned no page text");
}

/** A Monitor that is already gone (404) counts as deleted. */
export async function deleteMonitor(env: Env, id: string): Promise<void> {
  try {
    await tinyfishFetch(env, monitorUrl(id), { method: "DELETE" });
  } catch (err) {
    if (err instanceof TinyFishError && err.status === 404) return;
    throw err;
  }
}
