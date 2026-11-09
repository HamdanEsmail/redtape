import { Hono, type Context } from "hono";
import { adminOnly, visitorHash } from "../auth";
import type { Env } from "../env";
import { advanceLater } from "../compare/advance";
import { checkInput, importComparison, startPublicComparison } from "../compare/create";
import { listComparisons, readComparison } from "../compare/read";
import { TinyFishError } from "../tinyfish/client";

export const comparisonsRouter = new Hono<{ Bindings: Env }>();

const FINISHED = new Set(["ready", "failed"]);
const ID = /^[a-z0-9]{12}$/;

async function jsonBody(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function demoOf(v: unknown): number | null | "bad" {
  if (v === undefined || v === null) return null;
  return v === 1 || v === 2 || v === 3 ? v : "bad";
}

comparisonsRouter.post("/api/comparisons", async (c) => {
  // While the site is switched off, nobody can start a comparison and spend the budget.
  if (c.env.SITE_ENABLED !== "1") return c.json({ error: "not_found" }, 404);
  const body = await jsonBody(c);
  if (body === null) return c.json({ error: "invalid", field: null, message: "Send a JSON object with activity and places." }, 400);
  const input = checkInput(body);
  if (!input.ok) return c.json({ error: "invalid", field: input.field, message: input.message }, 400);
  const visitor = await visitorHash(c.env, c.req.header("CF-Connecting-IP"));
  const started = await startPublicComparison(c.env, input.input, visitor, new Date());
  if (!started.ok) return c.json({ error: started.error, message: started.message }, started.error === "spend_stop" ? 503 : 429);
  if (!FINISHED.has(started.state)) advanceLater(c.env, c.executionCtx, started.id);
  return c.json({ id: started.id, state: started.state, cached: started.cached }, 202);
});

comparisonsRouter.get("/api/comparisons", async (c) => c.json({ comparisons: await listComparisons(c.env.DB) }));

comparisonsRouter.get("/api/comparisons/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID.test(id)) return c.json({ error: "not_found" }, 404);
  const view = await readComparison(c.env.DB, id);
  if (view === null) return c.json({ error: "not_found" }, 404);
  if (!FINISHED.has(view.state)) advanceLater(c.env, c.executionCtx, view.id);
  return c.json(view);
});

comparisonsRouter.post("/admin/import", adminOnly, async (c) => {
  const body = await jsonBody(c);
  if (body === null || typeof body.run_id !== "string" || body.run_id === "") {
    return c.json({ error: "invalid", field: "run_id", message: "Send run_id with activity and places." }, 400);
  }
  const input = checkInput(body);
  if (!input.ok) return c.json({ error: "invalid", field: input.field, message: input.message }, 400);
  const demo = demoOf(body.demo);
  if (demo === "bad") return c.json({ error: "invalid", field: "demo", message: "demo is 1, 2 or 3." }, 400);
  try {
    const id = await importComparison(c.env, body.run_id, input.input, demo, new Date());
    advanceLater(c.env, c.executionCtx, id);
    return c.json({ id, state: "checking", cached: false }, 202);
  } catch (err) {
    if (err instanceof TinyFishError) return c.json({ error: "run_unreadable", code: err.code }, 502);
    throw err;
  }
});
