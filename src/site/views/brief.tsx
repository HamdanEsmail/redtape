// The sheet for a lawyer: made to print. Activity and places, unclear rules, one question per
// gap with its link and a fee lead when there is one, then every item with its official page
// and checked date. A comparison that is not ready shows its state and a link to its page.
import { lawyerSheet, type LawyerQuestion } from "../../brief/questions";
import type { ComparisonView, ItemView } from "../../compare/read";
import { DISCLAIMER, stateLine } from "../../compare/words";
import { shownDate } from "../../core/dates";
import { hostOf, safeHref } from "../format";
import { SiteShell } from "../layout";

function LinkOrText(props: { url: string | null }) {
  if (props.url === null || props.url === "") return null;
  const href = safeHref(props.url);
  return href === null ? <p>{props.url}</p> : <p><a href={href}>{props.url}</a></p>;
}

function QuestionBlock(props: { q: LawyerQuestion }) {
  const { q } = props;
  const lead = q.lead;
  const leadHref = lead === null ? null : safeHref(lead.url);
  return (
    <div class="q">
      <p>{q.text}</p>
      <LinkOrText url={q.url} />
      {lead !== null ? (
        <p>
          A page on the same site that may hold the fee: {lead.title},{" "}
          {leadHref === null ? lead.url : <a href={leadHref}>{lead.url}</a>}
        </p>
      ) : null}
    </div>
  );
}

function ItemBlock(props: { item: ItemView }) {
  const { item } = props;
  const href = safeHref(item.url);
  const host = hostOf(item.url);
  const day = item.checked_at === null ? "" : shownDate(item.checked_at);
  return (
    <div class="q">
      <p>
        <b>{item.place}</b>
        {item.category}: {item.name}
      </p>
      {item.url === null || item.url === "" ? (
        <p>no official page found</p>
      ) : href === null ? (
        <p>{item.url}</p>
      ) : (
        <p>
          <a href={href}>{host}</a>
        </p>
      )}
      {day !== "" ? <p>checked {day}</p> : null}
    </div>
  );
}

export function BriefPage(props: { view: ComparisonView; featuredId: string | null }) {
  const { view } = props;
  const ready = view.state === "ready";
  const sheet = ready ? lawyerSheet(view) : null;
  return (
    <SiteShell
      title={`Redtape: questions for a lawyer`}
      description={`The gaps and the questions for ${view.activity}, with every official page.`}
      featuredId={props.featuredId}
    >
      <section class="page" data-ink="light">
        <h1 class="disp">Hand this to a lawyer</h1>
        <p class="say">
          {ready
            ? "The activity, the places, every unclear rule, one question per gap, then every item with its official page."
            : stateLine(view.state, view.notice)}
        </p>
        <div class="body">
          {ready && sheet !== null ? (
            <>
              <h2>The activity</h2>
              <p>{sheet.activity}</p>
              <p>{sheet.places.join(" · ")}</p>
              <h2>Unclear</h2>
              {sheet.unclear.length === 0 ? (
                <p>No unclear rules were returned.</p>
              ) : (
                sheet.unclear.map((line) => <p>{line}</p>)
              )}
              <h2>Questions</h2>
              {sheet.questions.length === 0 ? (
                <p>No gaps were found.</p>
              ) : (
                sheet.questions.map((q) => <QuestionBlock q={q} />)
              )}
              <h2>Every item</h2>
              {sheet.items.map((item) => (
                <ItemBlock item={item} />
              ))}
              <p class="note">{DISCLAIMER}</p>
            </>
          ) : (
            <>
              <p>
                <a href={`/comparisons/${view.id}`}>Open this comparison</a>
              </p>
              <p class="note">{DISCLAIMER}</p>
            </>
          )}
        </div>
      </section>
    </SiteShell>
  );
}
