// A comparison's page: running (plain state, what has arrived, a refresh), ready (the grid in
// full, each cell a details element, the verdict, the lawyer's questions, the exports), or
// failed (the failure sentence and a link back to the form). An unknown id is a 404 in the shell.
import type { ComparisonView } from "../../compare/read";
import { BAR_LABEL, DISCLAIMER, NO_ITEM, RUNNING, STEP_OF, STEPS, USUALLY, waitClock } from "../../compare/words";
import { Exports, Grid, Hero, LawyerQuestions, Verdict } from "../components";
import { firstSentence, placeAskLine, realItems, shortPlace } from "../format";
import { Bar, Footer, HOME_DESCRIPTION, Layout } from "../layout";

export const REFRESH_SECONDS = 5;

function PlacesLine(props: { places: string[] }) {
  return <p>{props.places.map(shortPlace).join(" · ")}</p>;
}

/**
 * What a visitor watches while a comparison runs: the three steps with the one it is on, a bar, and a
 * clock. The last step has a real count (the items checked of all the items), so its bar is that
 * count; the steps before it have none to show, so their bar only moves. A visitor who sees nothing
 * move reads a working comparison as a stuck one.
 */
function Progress(props: { view: ComparisonView; checked: number; items: number }) {
  const { view, checked, items } = props;
  const at = STEP_OF[view.state] ?? -1;
  const counted = view.state === "checking" && items > 0;
  return (
    <div class="progress">
      <ol class="wait-steps" aria-label="Progress">
        {STEPS.map((step, i) => (
          <li class={i < at ? "done" : undefined} aria-current={i === at ? "step" : undefined}>
            {step}
          </li>
        ))}
      </ol>
      {counted ? (
        <progress class="meter" value={checked} max={items}>
          {checked} of {items}
        </progress>
      ) : (
        <div class="bar" role="progressbar" aria-label={BAR_LABEL[view.state] ?? BAR_LABEL.queued}></div>
      )}
      <p class="wait-clock">
        {counted ? `${checked} of ${items} items checked. ` : ""}
        {at >= 0 ? (
          <>
            <span class="clock" data-since={view.created_at}>
              {waitClock(view.created_at, new Date())}
            </span>{" "}
            so far.{" "}
          </>
        ) : null}
        A comparison usually takes {USUALLY}. This page refreshes itself.
      </p>
    </div>
  );
}

function AskStatus(props: { view: ComparisonView }) {
  const { view } = props;
  const running = view.state !== "ready" && view.state !== "failed";
  const said = RUNNING[view.state] ?? RUNNING.queued!;
  const items = realItems(view.items);
  const checked = items.filter((i) => i.check_kind !== null).length;
  const place = view.verdict.place;
  return (
    <div class="ask">
      <PlacesLine places={view.places} />
      {running ? <p>{said}</p> : null}
      {running ? <Progress view={view} checked={checked} items={items.length} /> : null}
      {view.state === "failed" ? (
        <>
          <p>{view.notice}</p>
          <p>
            <a href="/#ask">Measure another activity</a>
          </p>
        </>
      ) : null}
      {view.state === "ready" ? (
        <>
          {place !== null && view.verdict.paragraph.trim() !== "" ? (
            <>
              <p class="lead">
                <b>Shortest tape: {shortPlace(place)}</b>
              </p>
              <p class="lead">
                {firstSentence(view.verdict.paragraph)}
                {view.verdict.cost_warning !== null ? ` ${view.verdict.cost_warning}` : ""}
              </p>
            </>
          ) : (
            view.figures.map((fig) => <p class="lead">{placeAskLine(fig)}</p>)
          )}
          <p class="go">
            <a href="#grid">See every requirement</a>
          </p>
          <p class="note">{DISCLAIMER}</p>
        </>
      ) : (
        <p>{DISCLAIMER}</p>
      )}
    </div>
  );
}

function Running(props: { view: ComparisonView }) {
  const { view } = props;
  return (
    <section class="grid run" data-ink="light">
      <table class="in">
        <thead>
          <tr>
            <th></th>
            {view.places.map((p) => (
              <th scope="col">
                <div class="place disp">{shortPlace(p)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.categories.map((cat, ci) => (
            <tr>
              <th scope="row">{cat}</th>
              {view.places.map((place, pi) => {
                const item = view.items.find((i) => i.place_index === pi && i.category_n === ci + 1);
                if (item === undefined || item.name === NO_ITEM) {
                  return (
                    <td class="none" data-p={shortPlace(place)}>
                      {NO_ITEM}
                    </td>
                  );
                }
                return (
                  <td data-p={shortPlace(place)}>
                    <p class="what">{item.name}</p>
                    {item.check_kind !== null ? <p class="src">{item.check_result}</p> : <p class="src">Not checked yet.</p>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Ready(props: { view: ComparisonView }) {
  return (
    <>
      <Grid view={props.view} openable />
      <Verdict view={props.view} full />
      <LawyerQuestions view={props.view} />
      <Exports id={props.view.id} />
    </>
  );
}

export function ComparisonPage(props: { view: ComparisonView; featuredId: string | null }) {
  const { view } = props;
  const running = view.state !== "ready" && view.state !== "failed";
  const gridHref = props.featuredId !== null ? `/comparisons/${props.featuredId}` : "/#grid";
  return (
    <Layout
      title={`Redtape: ${view.activity}`}
      description={HOME_DESCRIPTION}
      refreshSeconds={running ? REFRESH_SECONDS : undefined}
    >
      <Bar gridHref={gridHref} askHref="/#ask" />
      <main id="top">
        <Hero activity={view.activity}>
          <AskStatus view={view} />
        </Hero>
        {view.state === "checking" ? <Running view={view} /> : null}
        {view.state === "ready" ? <Ready view={view} /> : null}
      </main>
      <Footer gridHref={gridHref} />
    </Layout>
  );
}

export function NotFoundPage(props: { featuredId: string | null; comparison: boolean }) {
  const gridHref = props.featuredId !== null ? `/comparisons/${props.featuredId}` : "/#grid";
  const sentence = props.comparison ? "No comparison here." : "There is no page here.";
  return (
    <Layout title={props.comparison ? "Redtape: no comparison here" : "Redtape: no page here"} description={HOME_DESCRIPTION}>
      <Bar gridHref={gridHref} askHref="/#ask" />
      <main id="top">
        <Hero activity={null}>
          <div class="ask">
            <p>{sentence}</p>
            <p>
              <a href="/">Home</a>
            </p>
            <p>
              <a href="/comparisons">Saved comparisons</a>
            </p>
          </div>
        </Hero>
      </main>
      <Footer gridHref={gridHref} />
    </Layout>
  );
}
