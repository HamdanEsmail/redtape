// A fee lead is a page on the item's own official host that may hold a fee the item's page
// does not state. It is a lead only: it never puts a number in the grid.
import type { SearchHit } from "../tinyfish/search";

/** Hostname with a leading www. removed, or null when the address is not a URL. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** True when the result is on the item's host exactly, or on a subdomain of it. */
export function onItemHost(resultUrl: string, itemHost: string): boolean {
  const h = hostOf(resultUrl);
  if (h === null) return false;
  const want = itemHost.replace(/^www\./i, "").toLowerCase();
  if (want === "") return false;
  return h === want || h.endsWith(`.${want}`);
}

/** The first hit on the item's host (or a subdomain of it). Other hosts are ignored. */
export function pickFeeLead(hits: SearchHit[], itemHost: string): { title: string; url: string } | null {
  for (const hit of hits) {
    if (onItemHost(hit.url, itemHost)) return { title: hit.title, url: hit.url };
  }
  return null;
}
