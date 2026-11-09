// Calls the Worker in-process the way the platform does: a Request, an execution context, then
// waits for every waitUntil() promise to settle before returning. Use it for any test that depends
// on work scheduled with waitUntil (SELF.fetch does not wait for it).
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { Env } from "../../src/env";
import worker from "../../src/index";

const BASE = "https://redtape.test";

export async function callWorker(input: string | Request, init?: RequestInit, bindings?: Partial<Env>): Promise<Response> {
  // A bare path such as "/api/stats" is resolved against BASE.
  const request = new Request(typeof input === "string" ? new URL(input, BASE).href : input, init);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, { ...env, ...bindings }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
