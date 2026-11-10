import { ACTIVITY_MAX_CHARS, PLACE_COUNT, PLACE_MAX_CHARS } from "../core/limits";
import { alike, firstWords } from "../research/report";

export type ComparisonInput = { activity: string; places: string[] };

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Lower case, letters and digits only, single spaces: how two typed values are compared. */
function norm(s: string): string {
  return oneLine(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function reuseKey(activity: string, places: string[]): string {
  return [norm(activity), ...places.map(norm).sort()].join("|");
}

/** The place name up to a trailing parenthesis or comma: "Austin, Texas" → "Austin". The home
 *  shows its example's places this way. */
export function shortPlace(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").replace(/,.*$/, "");
}

/**
 * True when `typed` asks for a stored comparison with some of its places written in short: the
 * same activity, and each typed place is one of the stored places in full or as the home shows it
 * ("Austin" for "Austin, Texas"), every stored place asked once, in any order. A place typed with
 * another qualifier ("Austin, Minnesota") is another place.
 */
export function asksFor(typed: ComparisonInput, activity: string, places: string[]): boolean {
  if (norm(typed.activity) !== norm(activity) || typed.places.length !== places.length) return false;
  const left = places.map((p) => [norm(p), norm(shortPlace(p)), norm(firstWords(p))]);
  for (const t of typed.places.map(norm)) {
    const at = left.findIndex((names) => names.includes(t));
    if (at === -1) return false;
    left.splice(at, 1);
  }
  return true;
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
