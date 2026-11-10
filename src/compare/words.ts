// Honest-state sentences. These words are exact.
import { COMPARISON_TAKES_MINUTES } from "../core/limits";

export const DAILY_LIMIT = "Today's 2 new comparisons are used. Saved comparisons still open.";
export const VISITOR_LIMIT = "You have started today's comparison from here already. Saved comparisons still open.";
export const SPEND_STOP = "New comparisons are closed: this demo has spent its budget. Saved comparisons still open.";
/** Shown when the site cannot count a visitor (its secret is not set), so it starts nothing. */
export const CLOSED = "New comparisons are closed for the moment. Saved comparisons still open.";
export const LAYOUT_FAIL = "This comparison did not finish: the research did not come back in the agreed layout. Nothing is shown.";
export const TIMEOUT_FAIL = "This comparison did not finish: TinyResearch took too long. Nothing is shown.";
export const RESEARCH_FAIL = "This comparison did not finish: the research run failed. Nothing is shown.";
export const NO_ITEM = "No item returned";
export const DISCLAIMER = "A starting point to confirm with a lawyer, not legal advice.";

export const RUNNING: Record<string, string> = {
  queued: "Waiting for the comparison before it to finish.",
  finding: "Finding the official government sites of each place.",
  researching: "TinyResearch is reading the official pages. This takes about five to ten minutes.",
  checking: "Reading every official page again to find each quoted sentence.",
};

/** The three steps of a comparison, as its running page names them, and the step each state is on. */
export const STEPS = ["Find the official sites", "Read the rules", "Check every page"] as const;
export const STEP_OF: Record<string, number> = { finding: 0, researching: 1, checking: 2 };
/** What the moving bar of a step with no count to show is called. */
export const BAR_LABEL: Record<string, string> = {
  queued: "Waiting for the comparison before it",
  finding: "Finding the official sites",
  researching: "Reading the rules",
  checking: "Checking every page",
};
/** "15 to 25 minutes": how long a whole comparison usually takes. */
export const USUALLY = `${COMPARISON_TAKES_MINUTES.from} to ${COMPARISON_TAKES_MINUTES.to} minutes`;

/** Minutes and seconds since the comparison was asked for, as "6:32". Never negative. */
export function waitClock(createdAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / 1000)) || 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The sentence a running or failed comparison shows. Empty when it is ready. */
export function stateLine(state: string, notice: string | null): string {
  if (state === "ready") return "";
  if (state === "failed") return notice ?? RESEARCH_FAIL;
  return RUNNING[state] ?? RUNNING.queued!;
}

export function failedNotice(reason: string | null): string {
  if (reason === "layout") return LAYOUT_FAIL;
  if (reason === "timeout") return TIMEOUT_FAIL;
  if (reason === "research_failed") return RESEARCH_FAIL;
  if (reason === "spend_stop") return SPEND_STOP;
  return RESEARCH_FAIL;
}
