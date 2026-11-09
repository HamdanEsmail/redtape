// Honest-state sentences. These words are exact.

export const DAILY_LIMIT = "Today's 2 new comparisons are used. Saved comparisons still open.";
export const VISITOR_LIMIT = "You have started today's comparison from here already. Saved comparisons still open.";
export const SPEND_STOP = "New comparisons are closed: this demo has spent its budget. Saved comparisons still open.";
export const LAYOUT_FAIL = "This comparison did not finish: the research did not come back in the agreed layout. Nothing is shown.";
export const TIMEOUT_FAIL = "This comparison did not finish: TinyResearch took too long. Nothing is shown.";
export const RESEARCH_FAIL = "This comparison did not finish: the research run failed. Nothing is shown.";
export const NO_ITEM = "No item returned";
export const DISCLAIMER = "A starting point to confirm with a lawyer, not legal advice.";

export function failedNotice(reason: string | null): string {
  if (reason === "layout") return LAYOUT_FAIL;
  if (reason === "timeout") return TIMEOUT_FAIL;
  if (reason === "research_failed") return RESEARCH_FAIL;
  if (reason === "spend_stop") return SPEND_STOP;
  return RESEARCH_FAIL;
}
