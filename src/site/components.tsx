// Pieces the home and a comparison's page share: the form, the grid, the verdict, the proved
// item, the authorities, how it works, the figures sentence, the lawyer's questions, saved rows.
import type { Child } from "hono/jsx";
import type { LawyerQuestion } from "../brief/questions";
import type { PlaceFigures } from "../compare/figures";
import type { ComparisonView, ItemView } from "../compare/read";
import { DISCLAIMER, NO_ITEM } from "../compare/words";
import { shownDate } from "../core/dates";
import {
  authoritiesOf,
  feeShort,
  figureIn,
  hostOf,
  pickProved,
  realItems,
  safeHref,
  short,
  savedActivity,
  shortPlace,
  stated,
  tapeClass,
  toActivity,
  unclearParts,
  waitHead,
  waitShort,
} from "./format";

export type HomeForm = {
  activity: string;
  place1: string;
  place2: string;
  place3: string;
  error: string | null;
};

export function AskForm(props: HomeForm) {
  return (
    <div class="ask" id="ask">
      <p>Type one activity and three places. Redtape lines up every licence, fee and wait from official government pages, each with its proof.</p>
      {props.error !== null ? (
        <p class="msg" role="alert">
          {props.error}
        </p>
      ) : null}
      <form method="post" action="/comparisons">
        <label class="wide">
          <span>the activity</span>
          <input name="activity" value={props.activity} maxlength={200} required />
        </label>
        <label>
          <span>place 1</span>
          <input name="place1" value={props.place1} maxlength={80} required />
        </label>
        <label>
          <span>place 2</span>
          <input name="place2" value={props.place2} maxlength={80} required />
        </label>
        <label>
          <span>place 3</span>
          <input name="place3" value={props.place3} maxlength={80} required />
        </label>
        <button class="btn" type="submit">
          Measure it
        </button>
      </form>
    </div>
  );
}

function SourceLine(props: { item: ItemView }) {
  const href = safeHref(props.item.url);
  const host = hostOf(props.item.url);
  const checked = props.item.checked_at === null ? "" : `, checked ${shownDate(props.item.checked_at)}`;
  if (props.item.url === null || props.item.url === "") return <p class="src">no official page found</p>;
  if (href === null) {
    return (
      <p class="src">
        {props.item.url}
        {checked}
      </p>
    );
  }
  return (
    <p class="src">
      <a href={href}>{host}</a>
      {checked}
    </p>
  );
}

function CellSummary(props: { item: ItemView }) {
  const { item } = props;
  return (
    <>
      <p class="what">{short(item.name, 64)}</p>
      <p class={stated(item.fee) ? "fee" : "fee gap"}>{feeShort(item.fee)}</p>
      <p class={stated(item.time) ? "wait" : "wait gap"}>{waitShort(item.time)}</p>
      <SourceLine item={item} />
    </>
  );
}

function LinkOrText(props: { url: string | null; children: Child }) {
  const href = safeHref(props.url);
  if (href === null) return <>{props.children}</>;
  return <a href={href}>{props.children}</a>;
}

function CellBody(props: { item: ItemView }) {
  const { item } = props;
  const href = safeHref(item.url);
  const host = hostOf(item.url);
  const label = item.source_label;
  return (
    <div class="more">
      <p>{item.authority}</p>
      <p>Required: {item.required}</p>
      <p>Renewal: {item.renewal}</p>
      <p>Ongoing filings: {item.ongoing}</p>
      {item.quote !== "" ? <blockquote>“{item.quote}”</blockquote> : null}
      <p>
        {item.url === null || item.url === "" ? (
          "no official page found"
        ) : href === null ? (
          item.url
        ) : (
          <>
            <a href={href}>{host}</a>
            {label !== null ? `, ${label}` : ""}
          </>
        )}
      </p>
      {item.check_result !== "" ? <p>{item.check_result}</p> : null}
    </div>
  );
}

function itemAt(view: ComparisonView, placeIndex: number, categoryN: number): ItemView | null {
  return view.items.find((i) => i.place_index === placeIndex && i.category_n === categoryN) ?? null;
}

function Tape(props: { items: ItemView[] }) {
  const pieces = realItems(props.items);
  return (
    <div class="tape" role="img" aria-label={`${pieces.length} requirements`}>
      {pieces.map((i) => (
        <i class={tapeClass(i)}></i>
      ))}
    </div>
  );
}

export function Grid(props: { view: ComparisonView; openable: boolean }) {
  const { view, openable } = props;
  return (
    <section class="grid" id="grid" data-ink="light">
      <div class="top">
        <h2 class="disp in">Same row, three places</h2>
        <p class="in">Every requirement sits beside its match in the other two places. A fee the official page does not state is left open, never guessed.</p>
      </div>
      <table class="in">
        <thead>
          <tr>
            <th></th>
            {view.places.map((place, pi) => {
              const fig = view.figures.find((f) => f.place === place);
              const items = view.items.filter((i) => i.place_index === pi);
              return (
                <th scope="col">
                  <div class="place disp">{shortPlace(place)}</div>
                  <Tape items={items} />
                  <div class="tot">
                    <b>
                      {fig?.feesStated ?? 0} of {fig?.feesOf ?? 0} fees stated
                    </b>
                    <br />
                    longest stated wait: {waitHead(fig?.longestWait ?? null)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {view.categories.map((cat, ci) => (
            <tr>
              <th scope="row">{cat}</th>
              {view.places.map((place, pi) => {
                const item = itemAt(view, pi, ci + 1);
                if (item === null || item.name === NO_ITEM) {
                  return (
                    <td class="none" data-p={shortPlace(place)}>
                      {NO_ITEM}
                    </td>
                  );
                }
                return (
                  <td data-p={shortPlace(place)}>
                    {openable ? (
                      <details>
                        <summary>
                          <CellSummary item={item} />
                        </summary>
                        <CellBody item={item} />
                      </details>
                    ) : (
                      <CellSummary item={item} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="key">
        <span>
          <i></i>one requirement, its fee stated on an official page
        </span>
        <span>
          <i class="half"></i>one requirement, its fee stated but not confirmed
        </span>
        <span>
          <i class="open"></i>one requirement, fee not stated: left open
        </span>
      </div>
    </section>
  );
}

function PlaceFiguresBlock(props: { fig: PlaceFigures }) {
  const { fig } = props;
  const notStated =
    fig.feesNotStated === 0
      ? null
      : ` · ${fig.feesNotStated} ${fig.feesNotStated === 1 ? "fee" : "fees"} not stated`;
  let fees: string;
  if (fig.feesSum !== null) fees = `${fig.feesSum}${notStated ?? ""}`;
  else if (fig.feesList !== null) fees = fig.feesList.join("; ");
  else fees = "no stated fees";
  return (
    <li>
      <b>{shortPlace(fig.place)}</b>
      {fig.requirements} {fig.requirements === 1 ? "requirement" : "requirements"}
      <br />
      {fig.feesStated} of {fig.feesOf} fees stated
      <br />
      {fees}
      <br />
      longest stated wait: {waitHead(fig.longestWait)}
    </li>
  );
}

export function Verdict(props: { view: ComparisonView }) {
  const { view } = props;
  const heading = view.verdict.place === null ? "Shortest tape" : `Shortest tape: ${shortPlace(view.verdict.place)}`;
  return (
    <section class="verdict" data-ink="dark" data-bg="tape">
      <h2 class="disp in">{heading}</h2>
      <p class="why in">{short(view.verdict.paragraph, 330)}</p>
      <ul class="in">
        {view.verdict.tradeoffs.map((t) => (
          <li>
            <b>{shortPlace(t.place)}</b>
            {short(t.line, 210)}
          </li>
        ))}
      </ul>
      <ul class="figs in">
        {view.figures.map((fig) => (
          <PlaceFiguresBlock fig={fig} />
        ))}
      </ul>
      {view.verdict.cost_warning !== null ? <p class="cost in">{view.verdict.cost_warning}</p> : null}
      <p class="fx in">Currencies are never converted between places.</p>
    </section>
  );
}

function QuoteMarked(props: { quote: string }) {
  const figure = figureIn(props.quote);
  if (figure === null) return <>“{props.quote}”</>;
  const i = props.quote.indexOf(figure);
  if (i < 0) return <>“{props.quote}”</>;
  return (
    <>
      “{props.quote.slice(0, i)}
      <mark>{figure}</mark>
      {props.quote.slice(i + figure.length)}”
    </>
  );
}

export function ProvedItem(props: { view: ComparisonView }) {
  const pick = pickProved(props.view.items);
  if (pick === null) return null;
  const cat = pick.category;
  const href = safeHref(pick.url);
  const host = hostOf(pick.url);
  const day = pick.checked_at === null ? "" : shownDate(pick.checked_at);
  return (
    <section class="proof" data-ink="dark" data-bg="ink">
      <h2 class="disp in">No sentence, no claim</h2>
      <p class="say in">Each item carries the sentence it rests on, copied from the official page, and the day Redtape read that page again to find it.</p>
      <div class="sheet in">
        <p class="meta">
          {shortPlace(pick.place)} · {cat}
        </p>
        <h3>{pick.name}</h3>
        <blockquote>
          <QuoteMarked quote={pick.quote} />
        </blockquote>
        <p class="foot">
          {href === null ? host : <a href={href}>{host}</a>}
          {pick.authority !== "" ? ` · ${short(pick.authority, 70)}` : ""}
        </p>
        <p class="ok">
          {pick.check_result !== "" ? pick.check_result : day !== "" ? `Read again on ${day}: the sentence is on the page.` : ""}
          {stated(pick.fee) ? ` Fee: ${short(pick.fee, 80)}.` : ""}
        </p>
      </div>
    </section>
  );
}

export function Authorities(props: { view: ComparisonView }) {
  const names = authoritiesOf(props.view.items);
  if (names.length === 0) return null;
  return (
    <section class="names" data-ink="dark" data-bg="ink">
      <p class="in">
        <b>Every item comes from</b>{" "}
        {names.map((a, i) => (
          <>
            {i > 0 ? ", " : ""}
            <span>{a}</span>
          </>
        ))}
        .
      </p>
    </section>
  );
}

const HOW = [
  {
    verb: "Find",
    src: "/assets/austin-august-2019-31-austin-city-hall.jpg",
    alt: "Austin City Hall, Texas",
    note: "TinyFish Search finds the government sites of each place, so the research is held to official pages only.",
  },
  {
    verb: "Read",
    src: "/assets/manchester-town-hall.jpg",
    alt: "Manchester Town Hall, England",
    note: "TinyResearch reads them and returns every licence, permit, filing, fee and wait.",
  },
  {
    verb: "Check",
    src: "/assets/civil-war-red-tape-03-redeemed-csa.jpg",
    alt: "Bundles of redeemed bond coupons tied in red tape, 1860s",
    note: "Redtape opens each official page again with TinyFish Fetch and looks for the quoted sentence. No sentence, no claim.",
  },
  {
    verb: "Watch",
    src: "/assets/dubai-municipality-building-88679337.jpg",
    alt: "Dubai Municipality building",
    note: "A saved comparison is watched with TinyFish Monitor. When an official page changes, its item says so.",
  },
] as const;

export function HowItWorks(props: { minutes: number | null }) {
  return (
    <section class="how" id="how" data-ink="dark" data-bg="ink">
      {HOW.map((p) => {
        const note =
          p.verb === "Read" && props.minutes !== null
            ? `${p.note} This comparison took ${props.minutes} minutes.`
            : p.note;
        return (
          <div class="panel">
            <img src={p.src} alt={p.alt} loading="lazy" width="1920" height="1280" />
            <h3 class="verb disp">{p.verb}</h3>
            <p class="note">
              {note}
              <small>Pictured: {p.alt}</small>
            </p>
          </div>
        );
      })}
    </section>
  );
}

export function FiguresSentence(props: { view: ComparisonView }) {
  const items = realItems(props.view.items);
  const missing = items.filter((i) => !stated(i.fee)).length;
  const sources = props.view.sources_count ?? 0;
  const minutes = props.view.research_minutes;
  return (
    <section class="stats" data-ink="light">
      <h2 class="clip">This comparison in figures</h2>
      <p class="in">
        This comparison read <b>{sources}&nbsp;official pages</b>
        {minutes !== null ? (
          <>
            {" "}
            in <b>{minutes}&nbsp;minutes</b>
          </>
        ) : null}
        , found <b>{items.length}&nbsp;requirements</b> in <b>{props.view.places.length}&nbsp;places</b>, and left{" "}
        <b>{missing}&nbsp;fees</b> open because no official page states them.
      </p>
    </section>
  );
}

export function LawyerHome(props: { view: ComparisonView }) {
  const lines = props.view.unclear.slice(0, 3);
  return (
    <section class="law" data-ink="dark" data-bg="deep">
      <h2 class="disp in">Then ask a lawyer</h2>
      <p class="say in">Where the official pages are unclear or disagree, Redtape does not pick a side. It writes the question down for the person who can settle it.</p>
      <ol class="in">
        {lines.map((u) => {
          const p = unclearParts(u);
          return (
            <li>
              <b>{p.head}</b>
              {p.rest}
            </li>
          );
        })}
        <li>
          <a href={`/comparisons/${props.view.id}/brief`}>Every question for a lawyer</a>
        </li>
      </ol>
    </section>
  );
}

function QuestionLead(props: { q: LawyerQuestion }) {
  if (props.q.lead === null) return null;
  const href = safeHref(props.q.lead.url);
  return (
    <p>
      A page on the same site that may hold the fee: {props.q.lead.title},{" "}
      {href === null ? props.q.lead.url : <a href={href}>{props.q.lead.url}</a>}
    </p>
  );
}

export function LawyerQuestions(props: { view: ComparisonView }) {
  return (
    <section class="law qs" data-ink="dark" data-bg="deep">
      <h2 class="disp in">Then ask a lawyer</h2>
      <p class="say in">Where the official pages are unclear or disagree, Redtape does not pick a side. It writes the question down for the person who can settle it.</p>
      <ol class="in">
        {props.view.questions.map((q) => (
          <li>
            <b>{shortPlace(q.place)}</b>
            {q.text}
            {q.url !== null && q.url !== "" ? (
              <p>
                <LinkOrText url={q.url}>{hostOf(q.url) || q.url}</LinkOrText>
              </p>
            ) : null}
            <QuestionLead q={q} />
          </li>
        ))}
        <li>
          <a href={`/comparisons/${props.view.id}/brief`}>Every question for a lawyer</a>
        </li>
      </ol>
    </section>
  );
}

export type SavedRow = { id: string; activity: string; places: string[]; created_at: string; finished_at: string | null };

export function SavedList(props: { rows: SavedRow[]; note?: string }) {
  return (
    <section class="saved" id="saved" data-ink="light">
      <h2 class="disp in">Already measured</h2>
      <div class="rows in">
        {props.rows.map((r) => {
          const day = shownDate(r.finished_at ?? r.created_at);
          return (
            <a href={`/comparisons/${r.id}`}>
              <b>{savedActivity(r.activity)}</b>
              <b>3 places</b>
              <span>
                {r.places.map(shortPlace).join(" · ")}, checked {day}
              </span>
            </a>
          );
        })}
      </div>
      {props.note !== undefined ? <p class="keep in">{props.note}</p> : null}
    </section>
  );
}

export function Close() {
  return (
    <section class="close" id="api" data-ink="dark" data-bg="ink">
      <h2 class="disp in">Now measure yours</h2>
      <div class="row in">
        <p>One activity, three places, about ten minutes. The comparison also comes as a spreadsheet, as JSON and from an API.</p>
        <a class="btn" href="#ask">
          Measure it
        </a>
      </div>
    </section>
  );
}

export function Exports(props: { id: string }) {
  return (
    <section class="exports" data-ink="light">
      <a href={`/comparisons/${props.id}.json`}>Download as JSON</a>
      <a href={`/comparisons/${props.id}.csv`}>Download as a spreadsheet</a>
    </section>
  );
}

export function Disclaimer() {
  return <p class="note">{DISCLAIMER}</p>;
}

export function Hero(props: { activity: string | null; children?: Child }) {
  const line2 = toActivity(props.activity);
  const nStyle = `--n:${line2.length}`;
  return (
    <div class="hero" data-ink="light">
      <div class="upper"></div>
      <h1 class="disp" style={nStyle}>
        <span class="l">
          How much{" "}
          <span class="slot">
            <img
              src="/assets/civil-war-red-tape-02-redeemed-csa.jpg"
              alt="red tape: bundles of 1860s bond coupons tied with red cloth tape"
              width="1920"
              height="1236"
            />
          </span>
        </span>
        <span class="l" style={nStyle}>
          {line2}
        </span>
      </h1>
      <div class="under disp" aria-hidden="true" data-t={line2} style={nStyle}></div>
      {props.children}
    </div>
  );
}
