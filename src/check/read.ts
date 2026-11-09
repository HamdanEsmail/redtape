// An official page is read with TinyFetch, waited for 15 seconds, tried up to 3 times when the
// read times out or the service is busy, and final at once when the page is blocked or missing.
import type { Env } from "../env";
import { fetchPage, type FetchPageResult } from "../tinyfish/fetch";

export function passingFailure(page: { error: string; status?: number }): boolean {
  return /timeout|timed_out|SERVICE_BUSY/i.test(page.error) || page.status === 429 || (page.status !== undefined && page.status >= 500);
}

export async function readOfficialPage(env: Env, url: string): Promise<FetchPageResult> {
  return fetchPage(env, url);
}
