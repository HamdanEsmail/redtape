// The question sent to TinyResearch: fixed text around the activity and the places. Line breaks
// are stripped before they go in, so a visitor cannot inject a new section.

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The research question for this activity and these three places. */
export function researchQuestion(activity: string, places: string[]): string {
  const act = oneLine(activity);
  const list = places.map(oneLine).join("; ");
  return `What does it take to ${act} in each of these places: ${list}?

Use official government sources only: national, state and city government and regulator websites. Never use law firms, consultancies, blogs or news as a source.

First choose between 6 and 9 requirement categories that fit this activity (for example legal entity registration, activity licence or permit, operator or staff certification, premises or location approval, insurance required by law, tax registration, ongoing filings). Use exactly the same categories, with the same names, in the same order, for every place.

Write the report in exactly this layout and nothing else outside it:

## Categories
A numbered list of the categories you chose, one per line.

## Place: <place name exactly as given>
For every category, one or more items. Each item is exactly:

### <category number>. <category name> :: <short name of the licence, permit, registration or filing>
| Field | Value |
|---|---|
| Required | yes, no, or depends (with the condition in a few words) |
| Authority | the government body that issues or receives it |
| Fee | the official fee with its currency, or not stated |
| Time to approval | as the official page states it, or not stated |
| Renewal | the renewal period and renewal fee, none, or not stated |
| Ongoing filings | what must be filed afterwards and how often, none, or not stated |
| Official URL | one URL of the official page this item comes from |
| Quote | one sentence copied exactly from that page that supports the fee or the requirement |

If a category does not apply in a place, still write one item for it with Required no and the official page that says so, or Required not stated when no official page settles it.
Where an official source does not state a fee or a time, write not stated. Never estimate and never fill a gap from a non-official source.

## Summary
| Place | Number of required items | Total stated fees | Longest stated wait | Items with a fee not stated |
One row per place.

## Recommendation
Which place is easiest to start in and why, in at most 120 words, then one line per place starting with the place name and giving its main trade-off.

## Unclear
A list of every rule that official sources leave unclear or that conflicts between sources, with the place and the URL.`;
}
