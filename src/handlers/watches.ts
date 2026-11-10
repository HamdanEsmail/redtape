// Watching a saved comparison: the two admin routes that start and stop it, and the hook a
// TinyFish Monitor calls after each read of a watched page.
import { Hono, type Context } from "hono";
import { adminOnly, constantTimeEqual } from "../auth";
import { SPEND_STOP } from "../compare/words";
import type { Env } from "../env";
import { TinyFishError } from "../tinyfish/client";
import { receiveMonitorRun, unwatchComparison, watchComparison } from "../watch/watch";

export const watchesRouter = new Hono<{ Bindings: Env }>();

const COMPARISON_ID = /^[a-z0-9]{12}$/;

async function idOf(c: Context<{ Bindings: Env }>): Promise<string | null> {
  try {
    const body: unknown = await c.req.json();
    const id = body !== null && typeof body === "object" ? (body as { id?: unknown }).id : null;
    return typeof id === "string" && COMPARISON_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// POST /admin/watch { id }: lists the comparison's official pages to watch. The every-minute job
// creates their Monitors, one in a run.
watchesRouter.post("/admin/watch", adminOnly, async (c) => {
  const id = await idOf(c);
  if (id === null) return c.json({ error: "invalid", field: "id", message: "Send the id of a saved comparison." }, 400);
  const result = await watchComparison(c.env, id, new Date());
  if (result.ok) return c.json({ id, pages: result.pages, added: result.added }, 202);
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "spend_stop") return c.json({ error: "spend_stop", message: SPEND_STOP }, 503);
  return c.json({ error: "not_saved", message: "Only a saved comparison that is ready can be watched." }, 409);
});

// POST /admin/unwatch { id }: deletes the comparison's Monitors, each by its own id, and their rows.
watchesRouter.post("/admin/unwatch", adminOnly, async (c) => {
  const id = await idOf(c);
  if (id === null) return c.json({ error: "invalid", field: "id", message: "Send the id of a saved comparison." }, 400);
  try {
    return c.json({ id, deleted: await unwatchComparison(c.env, id) });
  } catch (err) {
    if (err instanceof TinyFishError) return c.json({ error: "monitor_not_deleted", code: err.code }, 502);
    throw err;
  }
});

// POST /hooks/monitor/:secret: one run of a Monitor. A wrong secret is 404 with no body; a Monitor
// that is not one of Redtape's own is 404 `unknown_monitor`; a run already received changes nothing.
watchesRouter.post("/hooks/monitor/:secret", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (!secret || !constantTimeEqual(c.req.param("secret"), secret)) return c.body(null, 404);
  let data: unknown;
  try {
    data = JSON.parse(await c.req.text());
  } catch {
    return c.json({ error: "invalid_payload" }, 400);
  }
  const result = await receiveMonitorRun(c.env, data, new Date());
  return c.json(result.body, result.status);
});
