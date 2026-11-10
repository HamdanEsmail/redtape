// The TinyFish wallet. Read before a comparison's run starts and after it ends: the difference is
// what the run cost. It is one balance for the whole account, so other spending can be in that
// difference; the booking rules in src/compare/advance.ts allow for it. Free; each read appends a
// $0 ledger row.
import { PRICES } from "../core/limits";
import type { Env } from "../env";
import { readJson, TinyFishError, tinyfishFetch } from "./client";

const WALLET_API = "https://agent.tinyfish.ai/v1/wallet";
/** `available_balance` is a decimal string, e.g. "21.44"; negative when the wallet is overdrawn. */
const AMOUNT = /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

/** The spendable balance in US dollars. Anything but a USD amount in the documented shape is a
 *  TinyFishError `bad_wallet`, so a cost is never worked out from a guess. */
export async function readBalance(env: Env): Promise<number> {
  const res = await tinyfishFetch(env, WALLET_API, {
    method: "GET",
    spend: { kind: "wallet", amountUsd: PRICES.wallet, ref: "wallet" },
  });
  const body = await readJson<{ available_balance?: unknown; currency?: unknown }>(res);
  const amount = body.available_balance;
  if (typeof amount !== "string" || !AMOUNT.test(amount) || (body.currency !== undefined && body.currency !== "USD")) {
    throw new TinyFishError(502, "bad_wallet", "TinyFish returned a wallet balance that is not a USD amount");
  }
  return Number(amount);
}
