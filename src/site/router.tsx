// The site: pages rendered on the server from what is stored, over the same read functions as the
// JSON API. Behind SITE_ENABLED: switched off, every page path answers the API's JSON 404. A page
// never waits on TinyFish: it answers from the database and asks for an `advance` after the response.
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { visitorHash } from "../auth";
import { advanceLater } from "../compare/advance";
import { checkInput, startPublicComparison } from "../compare/create";
import { listComparisons, readComparison, type ComparisonView } from "../compare/read";
import type { Env } from "../env";
import { SECURITY_HEADERS } from "./layout";
import { Home, type HomeForm } from "./views/home";
import { ComparisonPage, NotFoundPage } from "./views/comparison";

type AppContext = Context<{ Bindings: Env }>;

export const siteEnabled = (env: Env): boolean => env.SITE_ENABLED === "1";

const COMPARISON_ID = /^[a-z0-9]{12}$/;

const FINISHED = new Set(["ready", "failed"]);

function field(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The API, the hooks and the assets are never a page. */
const notAPage = (path: string): boolean => /^\/(?:api|hooks|assets)(?:\/|$)/.test(path);

function render(c: AppContext, page: Child, status: ContentfulStatusCode = 200) {
  return c.html(page as unknown as string, status, { ...SECURITY_HEADERS, "cache-control": "no-store" });
}

/** The Worker's 404: the site's page for a page path while the site is on, else the JSON 404. */
export async function notFound(c: AppContext) {
  if (siteEnabled(c.env) && !notAPage(c.req.path)) {
    const id = await featuredId(c.env.DB);
    return render(c, <NotFoundPage featuredId={id} />, 404);
  }
  return c.json({ error: "not_found" }, 404);
}

async function featuredId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM comparisons WHERE state = 'ready' AND kept = 1 ORDER BY created_at DESC LIMIT 1")
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** The comparison the home shows: the newest kept one that is ready. */
async function featured(db: D1Database): Promise<ComparisonView | null> {
  const id = await featuredId(db);
  if (id === null) return null;
  return readComparison(db, id);
}

async function homePage(c: AppContext, form: HomeForm, status: ContentfulStatusCode = 200) {
  const [shown, saved] = await Promise.all([featured(c.env.DB), listComparisons(c.env.DB)]);
  return render(c, <Home featured={shown} saved={saved} form={form} />, status);
}

const emptyForm = (): HomeForm => ({ activity: "", place1: "", place2: "", place3: "", error: null });

export const siteRouter = new Hono<{ Bindings: Env }>();

siteRouter.get("/", async (c) => (siteEnabled(c.env) ? homePage(c, emptyForm()) : notFound(c)));

/** The form on the home: starts a comparison, or opens the stored one, and goes to its page. */
siteRouter.post("/comparisons", async (c) => {
  if (!siteEnabled(c.env)) return notFound(c);
  const body = await c.req.parseBody();
  const typed: HomeForm = {
    activity: field(body.activity),
    place1: field(body.place1),
    place2: field(body.place2),
    place3: field(body.place3),
    error: null,
  };
  const input = checkInput({ activity: typed.activity, places: [typed.place1, typed.place2, typed.place3] });
  if (!input.ok) return homePage(c, { ...typed, error: input.message }, 400);
  const visitor = await visitorHash(c.env, c.req.header("CF-Connecting-IP"));
  const started = await startPublicComparison(c.env, input.input, visitor, new Date());
  if (!started.ok) return homePage(c, { ...typed, error: started.message }, started.error === "spend_stop" ? 503 : 429);
  if (!FINISHED.has(started.state)) advanceLater(c.env, c.executionCtx, started.id);
  return c.redirect(`/comparisons/${started.id}`, 303);
});

siteRouter.get("/comparisons/:id", async (c) => {
  if (!siteEnabled(c.env)) return notFound(c);
  const id = c.req.param("id");
  if (!COMPARISON_ID.test(id)) return notFound(c);
  const [view, shown] = await Promise.all([readComparison(c.env.DB, id), featuredId(c.env.DB)]);
  if (view === null) return render(c, <NotFoundPage featuredId={shown} />, 404);
  if (!FINISHED.has(view.state)) advanceLater(c.env, c.executionCtx, view.id);
  return render(c, <ComparisonPage view={view} featuredId={shown} />);
});
