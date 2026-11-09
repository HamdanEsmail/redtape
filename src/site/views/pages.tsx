// The plain pages: saved comparisons, how it works, the API, and about. A short statement on the
// left and its proof on the right, in the site's own classes.
import type { Child } from "hono/jsx";
import creditsJson from "../../../design/credits.json";
import { checkSentence, type CheckKind } from "../../check/proof";
import { HowItWorks, SavedList, type SavedRow } from "../components";
import {
  ACTIVITY_MAX_CHARS,
  PLACE_MAX_CHARS,
  PUBLIC_COMPARISONS_PER_DAY,
  PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY,
  PUBLIC_TTL_DAYS,
  RESEARCH_BUDGET_USD,
  SPEND_STOP_USD,
} from "../../core/limits";
import { sourceLabel } from "../../core/official";
import { DISCLAIMER } from "../../compare/words";
import type { Stats } from "../../handlers/stats";
import { plural, safeHref } from "../format";
import { SiteShell } from "../layout";

type Credit = {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  credit: string;
};

const credits = creditsJson as Credit[];

const usd = (n: number) => `$${n.toFixed(2)}`;

const PROOF_DAY = "2026-11-09T12:00:00.000Z";
const PROOF_KINDS: CheckKind[] = ["found", "found_fee_missing", "quote_missing", "unreadable", "no_url"];

function Page(props: {
  title: string;
  description: string;
  heading: string;
  lede: string;
  featuredId: string | null;
  children?: Child;
  before?: Child;
}) {
  return (
    <SiteShell title={props.title} description={props.description} featuredId={props.featuredId}>
      {props.before ?? null}
      <section class="page" data-ink="light">
        <h1 class="disp">{props.heading}</h1>
        <p class="say">{props.lede}</p>
        <div class="body">{props.children}</div>
      </section>
    </SiteShell>
  );
}

export function SavedPage(props: { rows: SavedRow[]; featuredId: string | null }) {
  return (
    <SiteShell
      title="Redtape: saved comparisons"
      description="Comparisons already run, free to open, each with every licence, fee and wait from official pages."
      featuredId={props.featuredId}
    >
      <SavedList
        rows={props.rows}
        note={`A visitor's comparison is kept ${PUBLIC_TTL_DAYS} days. Saved comparisons stay. ${DISCLAIMER}`}
      />
    </SiteShell>
  );
}

export function HowPage(props: { featuredId: string | null }) {
  return (
    <Page
      title="Redtape: how it works"
      description="How Redtape finds official pages, checks each quoted sentence, and writes the questions a lawyer can settle."
      heading="How a claim is made"
      lede="Four steps, then the rules that decide what the page may say."
      featuredId={props.featuredId}
      before={<HowItWorks minutes={null} />}
    >
      <h2>Official sources</h2>
      <p>
        TinyFish Search finds the government sites of each place so the research is held to official pages. A source is
        labelled {sourceLabel("gov.uk")} when the host ends with .gov, .gov and a country code, .gouv, .gob, .go, .govt,
        .gc.ca, .mil, .europa.eu, .admin.ch or .bund.de, or sits on a short list of official portals. Otherwise it is
        labelled {sourceLabel("caa.co.uk")}. The list is a label and a search preference, never a reason to reject a
        source.
      </p>
      <h2>The proof check</h2>
      <p>
        For every item with an official URL, Redtape reads that page again with TinyFish Fetch and looks for the quoted
        sentence. The five results, in these words:
      </p>
      <ul>
        {PROOF_KINDS.map((kind) => (
          <li>{checkSentence(kind, PROOF_DAY)}</li>
        ))}
      </ul>
      <h2>not stated</h2>
      <p>
        A fee or a wait the official page does not give. It is never filled in, never called an error, and never
        softened. Free, none, 0 and no fee are stated fees.
      </p>
      <h2>The figures</h2>
      <p>
        For each place: how many requirements, how many fees are stated, the stated fees added when they share a
        currency (shown as at least the sum, with how many are not stated beside it), mixed currencies listed not added,
        the longest stated wait in the page's own words, and the gaps. Currencies are never converted between places.
      </p>
      <h2>Questions for a lawyer</h2>
      <p>
        Where a fee or a wait is not stated, or the sentence is not on the page, Redtape writes the question down. For a
        fee that is not stated, one search on the item's own host may add a lead, worded as a lead. It never puts a
        number in the grid.
      </p>
    </Page>
  );
}

function Endpoint(props: { method: string; path: string; children: Child }) {
  return (
    <div class="endpoint">
      <h2>
        {props.method} {props.path}
      </h2>
      {props.children}
    </div>
  );
}

export function ApiPage(props: { base: string; sampleId: string | null; featuredId: string | null }) {
  const id = props.sampleId ?? "<id>";
  return (
    <Page
      title="Redtape: API"
      description="Start a comparison and read the proved licences, fees and waits as JSON or CSV. No key is needed to read."
      heading="The same comparison, as data"
      lede="No key is needed to read. New comparisons are held to the same limits as the form."
      featuredId={props.featuredId}
    >
      <Endpoint method="POST" path="/api/comparisons">
        <p>
          Starts a comparison, or opens the stored one. Answers 202 with id, state and cached. Body: activity, places (three
          strings).
        </p>
        <pre>
          <code>{`curl -X POST ${props.base}/api/comparisons \\
  -H 'content-type: application/json' \\
  -d '{"activity":"open a small bakery","places":["Port Aldren","Northhaven","Eastmere"]}'`}</code>
        </pre>
      </Endpoint>
      <Endpoint method="GET" path="/api/comparisons/:id">
        <p>
          The comparison: id, activity, places, state, notice, categories, items (place, place_index, category_n, category,
          name, required, authority, fee, time, renewal, ongoing, url, quote, check_result, check_kind, checked_at,
          source_label, fee_lead), figures, verdict, unclear, sources_count, research_minutes, questions. While it runs,
          reading it moves it on.
        </p>
        <pre>
          <code>{`curl ${props.base}/api/comparisons/${id}`}</code>
        </pre>
      </Endpoint>
      <Endpoint method="GET" path="/api/comparisons/:id.csv">
        <p>One row per item: place, category, item, required, authority, fee, time, renewal, ongoing filings, official URL, quote, check result, checked at.</p>
        <pre>
          <code>{`curl ${props.base}/api/comparisons/${id}.csv`}</code>
        </pre>
      </Endpoint>
      <Endpoint method="GET" path="/api/comparisons">
        <p>The saved comparisons: every kept ready comparison and every visitor comparison still within its {PUBLIC_TTL_DAYS} days, newest first. comparisons is an array of id, activity, places, demo, created_at, finished_at.</p>
        <pre>
          <code>{`curl ${props.base}/api/comparisons`}</code>
        </pre>
      </Endpoint>
      <Endpoint method="GET" path="/api/stats">
        <p>Comparisons, spend_usd, tinyfish calls and cost by service, and the limits including spend_stop_usd.</p>
        <pre>
          <code>{`curl ${props.base}/api/stats`}</code>
        </pre>
      </Endpoint>
      <Endpoint method="POST" path="/admin/import">
        <p>Adopts a finished TinyResearch run at no cost. Body: run_id, activity, places. Needs the admin token.</p>
      </Endpoint>
      <p>
        A comparison's page also downloads as /comparisons/:id.json and /comparisons/:id.csv. A comparison that is not
        ready answers 409 with its state. The activity is at most {ACTIVITY_MAX_CHARS} characters, each place at most{" "}
        {PLACE_MAX_CHARS}. {PUBLIC_COMPARISONS_PER_DAY} new comparisons a day, {PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY} per
        visitor. Paid work stops at {usd(SPEND_STOP_USD)}.
      </p>
    </Page>
  );
}

export function AboutPage(props: { stats: Stats; featuredId: string | null }) {
  const t = props.stats.tinyfish;
  const rows: [string, string, string][] = [
    [
      "TinyResearch",
      "Reads each place's official rules and returns every requirement in the fixed layout, each point cited.",
      `${plural(t.research.calls, "call")}, ${plural(t.research.runs, "run")}, ${usd(t.research.usd)}`,
    ],
    ["Search", "Finds each place's official sites before the research, and a possible fee page for a gap.", `${plural(t.search.calls, "search", "searches")}, ${usd(t.search.usd)}`],
    ["Fetch", "Reads every official page again for the proof check.", `${plural(t.fetch.calls, "read")}, ${usd(t.fetch.usd)}`],
    ["Monitor", "Watches the fee pages of saved comparisons for changes.", `${plural(0, "call")}, ${usd(0)}`],
  ];
  return (
    <Page
      title="Redtape: about"
      description="How Redtape uses TinyFish, what it has spent, the limits, what it keeps, and the picture credits."
      heading="What it reads, and what it keeps"
      lede="TinyFish does the reading. The ledger records every call."
      featuredId={props.featuredId}
    >
      <h2>TinyFish</h2>
      <dl class="services">
        {rows.map(([name, job, use]) => (
          <div>
            <dt>{name}</dt>
            <dd>{job}</dd>
            <dd>{use}</dd>
          </div>
        ))}
      </dl>
      <p>
        In all: {usd(props.stats.spend_usd)} spent, from the ledger where every call is one row. A new comparison is
        budgeted at {usd(RESEARCH_BUDGET_USD)}. Paid work stops at {usd(SPEND_STOP_USD)}.
      </p>
      <h2>The limits</h2>
      <p>
        {PUBLIC_COMPARISONS_PER_DAY} new comparisons a day in all, {PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY} per visitor, one
        comparison in progress at a time. Opening a stored comparison is free. The activity is at most {ACTIVITY_MAX_CHARS}{" "}
        characters, each place at most {PLACE_MAX_CHARS}. Fetch and Search are free.
      </p>
      <h2>What it keeps</h2>
      <p>
        A visitor's comparison is kept {PUBLIC_TTL_DAYS} days, then deleted with its items. Saved comparisons stay. A
        visitor is known only by a salted hash of their address.
      </p>
      <h2>Pictures</h2>
      <ul class="credits">
        {credits.map((c) => {
          const href = safeHref(c.licenseUrl);
          return (
            <li>
              {c.credit}{" "}
              {href === null ? c.license : <a href={href}>{c.license}</a>}
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
