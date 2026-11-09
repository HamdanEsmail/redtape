import { ACTIVITY_MAX_CHARS, PLACE_COUNT, PLACE_MAX_CHARS } from "../core/limits";
import { alike, firstWords } from "../research/report";

export type ComparisonInput = { activity: string; places: string[] };

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function reuseKey(activity: string, places: string[]): string {
  const norm = (s: string) =>
    oneLine(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  return [norm(activity), ...places.map(norm).sort()].join("|");
}

export function checkInput(body: Record<string, unknown>): { ok: true; input: ComparisonInput } | { ok: false; field: string; message: string } {
  if (typeof body.activity !== "string") return { ok: false, field: "activity", message: "Send an activity and three places." };
  const activity = oneLine(body.activity);
  if (activity.length < 1 || activity.length > ACTIVITY_MAX_CHARS) {
    return { ok: false, field: "activity", message: `Activity must be 1 to ${ACTIVITY_MAX_CHARS} characters.` };
  }
  if (!Array.isArray(body.places) || body.places.length !== PLACE_COUNT || body.places.some((p) => typeof p !== "string")) {
    return { ok: false, field: "places", message: "Send exactly three places." };
  }
  const places = body.places.map(oneLine);
  if (places.some((p) => p.length < 1 || p.length > PLACE_MAX_CHARS)) {
    return { ok: false, field: "places", message: `Each place must be 1 to ${PLACE_MAX_CHARS} characters.` };
  }
  // Two places that start with the same words are refused, the same rule as the report reader.
  const keys = places.map(firstWords);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (alike(keys[i]!, keys[j]!)) {
        return {
          ok: false,
          field: "places",
          message: "Two places start with the same words. Write each one so it starts differently.",
        };
      }
    }
  }
  return { ok: true, input: { activity, places } };
}
